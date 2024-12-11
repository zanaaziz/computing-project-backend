import { APIGatewayProxyHandler } from 'aws-lambda';
import { userService } from '../services/user-service';
import { AppError, AuthenticationError, BadRequestError, NotFoundError } from '../utils/error-util';
import {
	registerSchema,
	loginSchema,
	confirmEmailSchema,
	refreshTokenSchema,
	resendConfirmationCodeSchema,
	confirmForgotPasswordSchema,
	forgotPasswordSchema,
} from '../utils/validation-util';
import {
	CognitoIdentityProvider,
	ConfirmForgotPasswordCommand,
	ConfirmSignUpCommand,
	ForgotPasswordCommand,
	GetUserAttributeVerificationCodeCommand,
	InitiateAuthCommand,
	ListUsersCommand,
	ResendConfirmationCodeCommand,
	SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { PostAuthenticationTriggerHandler } from 'aws-lambda';
import { jwtDecode } from 'jwt-decode';
import { v4 as uuidv4 } from 'uuid';

const cognito = new CognitoIdentityProvider({ region: process.env.AWS_REGION });

export const register: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { error } = registerSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { email, password, name } = body;
		const username = uuidv4();

		try {
			await cognito.send(
				new SignUpCommand({
					ClientId: process.env.COGNITO_CLIENT_ID!,
					Username: username,
					Password: password,
					UserAttributes: [
						{ Name: 'email', Value: email },
						{ Name: 'name', Value: name },
					],
				})
			);

			return {
				statusCode: 201,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'User registered successfully. Please verify your email.', email, username }),
			};
		} catch (cognitoError: any) {
			if (cognitoError.name === 'UsernameExistsException') {
				throw new BadRequestError('Email already exists');
			} else if (cognitoError.name === 'InvalidPasswordException') {
				throw new BadRequestError('Invalid password: Must be at least 8 characters with uppercase, lowercase, and numbers');
			} else if (cognitoError.name === 'InvalidParameterException') {
				throw new BadRequestError('Invalid email format');
			} else {
				console.error('Unexpected Cognito error:', cognitoError);
				throw new AppError('Registration failed', 500, 'REGISTRATION_FAILED');
			}
		}
	} catch (error) {
		console.error('Error:', error);
		if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Internal server error' }),
		};
	}
};

export const login: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { error } = loginSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { email, password } = body;

		try {
			const authResult = await cognito.send(
				new InitiateAuthCommand({
					AuthFlow: 'USER_PASSWORD_AUTH',
					ClientId: process.env.COGNITO_CLIENT_ID!,
					AuthParameters: {
						USERNAME: email,
						PASSWORD: password,
					},
				})
			);

			const decodedToken = jwtDecode<any>(authResult.AuthenticationResult?.IdToken!);
			const userId: string = decodedToken.sub;

			return {
				statusCode: 200,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					accessToken: authResult.AuthenticationResult?.AccessToken,
					idToken: authResult.AuthenticationResult?.IdToken,
					refreshToken: authResult.AuthenticationResult?.RefreshToken,
					expiresIn: authResult.AuthenticationResult?.ExpiresIn,
				}),
			};
		} catch (cognitoError: any) {
			if (cognitoError.name === 'UserNotConfirmedException') {
				throw new BadRequestError('Please confirm your email first');
			} else if (cognitoError.name === 'NotAuthorizedException') {
				throw new BadRequestError('Invalid credentials');
			} else if (cognitoError.name === 'InvalidParameterException') {
				throw new BadRequestError('Invalid email or password format');
			} else if (cognitoError.name === 'UserNotFoundException') {
				throw new BadRequestError('User not found');
			} else {
				console.error('Unexpected Cognito error:', cognitoError);
				throw new AppError('Login failed', 500, 'LOGIN_FAILED');
			}
		}
	} catch (error) {
		console.error('Error:', error);
		if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Internal server error' }),
		};
	}
};

export const confirmEmail: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { error } = confirmEmailSchema.validate(body);
		if (error) {
			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.details[0].message }),
			};
		}

		const { email, code } = body;

		const userResponse = await cognito.send(
			new ListUsersCommand({
				UserPoolId: process.env.COGNITO_USER_POOL_ID!,
				Filter: `email = "${email}"`,
			})
		);

		const users = userResponse.Users || [];
		if (users.length === 0) {
			throw new NotFoundError('User not found');
		}

		const username = users[0].Username;
		if (!username) {
			throw new NotFoundError('User has no username');
		}

		await cognito.send(
			new ConfirmSignUpCommand({
				ClientId: process.env.COGNITO_CLIENT_ID!,
				Username: username,
				ConfirmationCode: code,
			})
		);

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Email confirmed successfully' }),
		};
	} catch (error: any) {
		if (error.name === 'CodeMismatchException') {
			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Invalid verification code' }),
			};
		} else if (error.name === 'ExpiredCodeException') {
			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Verification code has expired' }),
			};
		} else if (error.name === 'UserNotFoundException') {
			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'User not found' }),
			};
		} else {
			console.error('Unexpected error:', error);
			return {
				statusCode: 500,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Internal server error' }),
			};
		}
	}
};

export const postConfirmation: PostAuthenticationTriggerHandler = async (event) => {
	try {
		const userId = event.request.userAttributes.sub;
		const email = event.request.userAttributes.email;
		const name = event.request.userAttributes.name;
		const username = event.userName;

		if (!userId || !email || !name) {
			console.error('Missing required user attributes:', { userId, username, email, name });
			throw new Error('Missing required user attributes');
		}

		await userService.createUser({ userId, username, email, name });

		console.log(`User ${userId} created successfully after confirmation`);
		return event;
	} catch (error) {
		console.error('Error in postConfirmation:', error);
		return event;
	}
};

export const refreshToken: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { error } = refreshTokenSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const refreshToken = body.refreshToken;

		const result = await cognito.send(
			new InitiateAuthCommand({
				AuthFlow: 'REFRESH_TOKEN_AUTH',
				ClientId: process.env.COGNITO_CLIENT_ID,
				AuthParameters: {
					REFRESH_TOKEN: refreshToken,
				},
			})
		);

		const decodedToken = jwtDecode<any>(result.AuthenticationResult?.IdToken!);
		const userId: string = decodedToken.sub;

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userId,
				accessToken: result.AuthenticationResult?.AccessToken,
				idToken: result.AuthenticationResult?.IdToken,
				refreshToken: result.AuthenticationResult?.RefreshToken ?? refreshToken,
				expiresIn: result.AuthenticationResult?.ExpiresIn,
			}),
		};
	} catch (error: any) {
		console.error('Error refreshing token:', error);

		if (error.name === 'NotAuthorizedException') {
			throw new AuthenticationError('Invalid refresh token');
		} else if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}

		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Internal server error' }),
		};
	}
};

/**
 * Handler to initiate password reset by sending a verification code to the user's email
 */
export const forgotPassword: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { error } = forgotPasswordSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { email } = body;

		const user = await userService.getUserByEmail(email);
		if (!user) {
			throw new NotFoundError('User not found');
		}

		await cognito.send(
			new ForgotPasswordCommand({
				ClientId: process.env.COGNITO_CLIENT_ID!,
				Username: user.username,
			})
		);

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Verification code sent to your email.' }),
		};
	} catch (error: any) {
		console.error('Error in forgotPassword:', error);
		if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Internal server error' }),
		};
	}
};

/**
 * Handler to confirm a new password using the verification code
 */
export const confirmForgotPassword: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { error } = confirmForgotPasswordSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { email, verificationCode, newPassword } = body;

		const user = await userService.getUserByEmail(email);
		if (!user) {
			throw new NotFoundError('User not found');
		}

		await cognito.send(
			new ConfirmForgotPasswordCommand({
				ClientId: process.env.COGNITO_CLIENT_ID!,
				Username: user.username,
				ConfirmationCode: verificationCode,
				Password: newPassword,
			})
		);

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Password has been reset successfully.' }),
		};
	} catch (error: any) {
		console.error('Error in confirmForgotPassword:', error);

		if (error.name === 'CodeMismatchException') {
			throw new BadRequestError('Invalid verification code');
		} else if (error.name === 'ExpiredCodeException') {
			throw new BadRequestError('Verification code has expired');
		} else if (error.name === 'UserNotFoundException') {
			throw new BadRequestError('User not found');
		} else if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Internal server error' }),
		};
	}
};

/**
 * Handler to resend the confirmation code for email verification during sign-up
 */
export const resendRegisterConfirmationCode: APIGatewayProxyHandler = async (event) => {
	try {
		const body = JSON.parse(event.body || '{}');
		const { error } = resendConfirmationCodeSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { username } = body;

		await cognito.send(
			new ResendConfirmationCodeCommand({
				ClientId: process.env.COGNITO_CLIENT_ID!,
				Username: username,
			})
		);

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Confirmation code resent successfully.' }),
		};
	} catch (error: any) {
		console.error('Error in resendRegisterConfirmationCode:', error);

		if (error.name === 'UserNotFoundException') {
			throw new BadRequestError('User not found');
		} else if (error.name === 'CodeDeliveryFailureException') {
			throw new AppError('Failed to send confirmation code', 500, 'CODE_DELIVERY_FAILED');
		} else if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Internal server error' }),
		};
	}
};

export const resendPatchEmaillVerificationCode: APIGatewayProxyHandler = async (event) => {
	try {
		const authHeader = event.headers['Authorization'] || event.headers['authorization'];
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			throw new BadRequestError('Invalid or missing Authorization header');
		}

		const accessToken = authHeader.split(' ')[1];
		if (!accessToken) {
			throw new BadRequestError('Missing access token');
		}

		await cognito.send(
			new GetUserAttributeVerificationCodeCommand({
				AccessToken: accessToken,
				AttributeName: 'email',
			})
		);

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Email verification code resent successfully.' }),
		};
	} catch (error: any) {
		console.error('Error in resendPatchEmaillVerificationCode:', error);
		if (error.name === 'CodeDeliveryFailureException') {
			throw new AppError('Failed to send verification code', 500, 'CODE_DELIVERY_FAILED');
		} else if (error.name === 'InvalidParameterException') {
			throw new BadRequestError('Invalid access token or attribute');
		}
		return {
			statusCode: error.statusCode || 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: error.message || 'Internal server error' }),
		};
	}
};
