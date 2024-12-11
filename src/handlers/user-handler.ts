import { APIGatewayProxyHandler } from 'aws-lambda';
import { userService } from '../services/user-service';
import { AppError, BadRequestError, NotFoundError } from '../utils/error-util';
import { patchEmailSchema, patchPasswordSchema, patchUserSchema, verifyEmailSchema } from '../utils/validation-util';
import { CognitoIdentityProvider, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const cognito = new CognitoIdentityProvider({ region: process.env.AWS_REGION });

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const getUser: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const user = await userService.getUser(userId);
		if (!user) {
			throw new NotFoundError('User not found');
		}
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(user),
		};
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

export const getAllUsers: APIGatewayProxyHandler = async (event) => {
	try {
		const users = await userService.getAllUsers();

		const sanitizedUsers = users.map((user) => ({
			userId: user.userId,
			name: user.name,
			profilePhotoUrl: user.profilePhotoUrl,
		}));
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(sanitizedUsers),
		};
	} catch (error) {
		console.error('Error fetching all users:', error);
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

export const updateUser: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const body = JSON.parse(event.body || '{}');
		const { error } = patchUserSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		await userService.updateUser(userId, { name: body.name });

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'User updated' }),
		};
	} catch (error) {
		console.error('Error updating user:', error);
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

export const patchPassword: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const authHeader = event.headers['Authorization'] || event.headers['authorization'];
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			throw new BadRequestError('Invalid or missing Authorization header');
		}

		const accessToken = authHeader.split(' ')[1];
		if (!accessToken) {
			throw new BadRequestError('Missing access token');
		}

		const body = JSON.parse(event.body || '{}');
		const { error } = patchPasswordSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { currentPassword, newPassword } = body;

		await cognito.changePassword({
			AccessToken: accessToken,
			PreviousPassword: currentPassword,
			ProposedPassword: newPassword,
		});

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Password updated successfully' }),
		};
	} catch (error: any) {
		console.error('Error updating password:', error);
		if (error.name === 'NotAuthorizedException') {
			throw new BadRequestError('Incorrect current password');
		}
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

export const patchEmail: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const body = JSON.parse(event.body || '{}');
		const { error } = patchEmailSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { newEmail } = body;
		const user = await userService.getUser(userId);
		if (!user) {
			throw new NotFoundError('User not found');
		}

		await cognito.adminUpdateUserAttributes({
			UserPoolId: process.env.COGNITO_USER_POOL_ID!,
			Username: user.username,
			UserAttributes: [{ Name: 'email', Value: newEmail }],
		});

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Email update initiated, please check your new email for a verification code' }),
		};
	} catch (error) {
		console.error('Error initiating email update:', error);
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

export const getUserById: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.pathParameters?.userId;
		if (!userId) {
			throw new BadRequestError('Missing userId in path');
		}
		const user = await userService.getUser(userId);
		if (!user) {
			throw new NotFoundError('User not found');
		}
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(user),
		};
	} catch (error) {
		console.error('Error fetching user by ID:', error);
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

export const verifyEmail: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const authHeader = event.headers['Authorization'] || event.headers['authorization'];
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			throw new BadRequestError('Invalid or missing Authorization header');
		}

		const accessToken = authHeader.split(' ')[1];
		if (!accessToken) {
			throw new BadRequestError('Missing access token');
		}

		const body = JSON.parse(event.body || '{}');
		const { error } = verifyEmailSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const { newEmail, verificationCode } = body;

		await cognito.verifyUserAttribute({
			AccessToken: accessToken,
			AttributeName: 'email',
			Code: verificationCode,
		});

		await userService.updateUser(userId, { email: newEmail });

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Email verified and updated successfully' }),
		};
	} catch (error: any) {
		console.error('Error verifying email:', error);
		if (error.name === 'CodeMismatchException') {
			throw new BadRequestError('Invalid verification code');
		}
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

export const deleteUser: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const user = await userService.getUser(userId);
		if (!user) {
			throw new NotFoundError('User not found');
		}

		await userService.deleteUserAndData(userId);

		await cognito.send(
			new AdminDeleteUserCommand({
				UserPoolId: process.env.COGNITO_USER_POOL_ID!,
				Username: user.username,
			})
		);

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'User account deleted successfully' }),
		};
	} catch (error) {
		console.error('Error deleting user:', error);
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

export const getProfilePhotoUploadUrl: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const { contentType } = event.queryStringParameters || {};

		const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!contentType || !acceptedTypes.includes(contentType)) {
			return {
				statusCode: 400,
				body: JSON.stringify({ error: 'Invalid or missing contentType. Accepted: image/jpeg, image/png, image/webp' }),
			};
		}

		const extension = contentType.split('/')[1];
		const key = `profile-photos/${userId}.${extension}`;

		const command = new PutObjectCommand({
			Bucket: process.env.IMAGES_BUCKET,
			Key: key,
			ContentType: contentType,
		});
		const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ uploadUrl, key }),
		};
	} catch (error) {
		console.error('Error generating profile photo upload URL:', error);
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

export const getCoverPhotoUploadUrl: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const { contentType } = event.queryStringParameters || {};

		const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!contentType || !acceptedTypes.includes(contentType)) {
			return {
				statusCode: 400,
				body: JSON.stringify({ error: 'Invalid or missing contentType. Accepted: image/jpeg, image/png, image/webp' }),
			};
		}

		const extension = contentType.split('/')[1];

		const key = `cover-photos/${userId}.${extension}`;
		const command = new PutObjectCommand({
			Bucket: process.env.IMAGES_BUCKET,
			Key: key,
			ContentType: contentType,
		});
		const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ uploadUrl, key }),
		};
	} catch (error) {
		console.error('Error generating cover photo upload URL:', error);
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

export const updateProfilePhoto: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const body = JSON.parse(event.body || '{}');
		const { key } = body;
		if (!key || typeof key !== 'string' || !key.startsWith(`profile-photos/${userId}`)) {
			throw new BadRequestError('Invalid or missing key');
		}
		const bucket = process.env.IMAGES_BUCKET;
		const profilePhotoUrl = `https://${bucket}.s3.amazonaws.com/${key}`;
		await userService.updateUser(userId, { profilePhotoUrl });
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Profile photo updated', profilePhotoUrl }),
		};
	} catch (error) {
		console.error('Error updating profile photo:', error);
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

export const updateCoverPhoto: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const body = JSON.parse(event.body || '{}');
		const { key } = body;
		if (!key || typeof key !== 'string' || !key.startsWith(`cover-photos/${userId}`)) {
			throw new BadRequestError('Invalid or missing key');
		}
		const bucket = process.env.IMAGES_BUCKET;
		const coverPhotoUrl = `https://${bucket}.s3.amazonaws.com/${key}`;
		await userService.updateUser(userId, { coverPhotoUrl });
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Cover photo updated', coverPhotoUrl }),
		};
	} catch (error) {
		console.error('Error updating cover photo:', error);
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
