import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { userRepository } from '../repositories/user-repository';
import { User } from '../models/user-model';
import { NotFoundError } from '../utils/error-util';

const cognito = new CognitoIdentityProvider({ region: process.env.AWS_REGION });

export const userService = {
	async createUser(data: { userId: string; username: string; email: string; name: string }): Promise<void> {
		const now = new Date().toISOString();
		const user: User = {
			userId: data.userId,
			username: data.username,
			name: data.name,
			email: data.email,
			createdAt: now,
			updatedAt: now,
			followerCount: 0,
		};
		await userRepository.createUser(user);
	},

	async getUser(userId: string): Promise<User | null> {
		return await userRepository.getUser(userId);
	},

	async getUserByEmail(email: string): Promise<User | null> {
		return await userRepository.getUserByEmail(email);
	},

	async updateUser(userId: string, updates: Partial<User>): Promise<void> {
		const updateFields: Partial<User> = { ...updates };

		if (Object.keys(updateFields).length > 0) {
			await userRepository.updateUser(userId, updateFields);
		}

		if (updates.name) {
			const user = await userRepository.getUser(userId);
			if (!user) {
				throw new NotFoundError('User not found');
			}
			await cognito.adminUpdateUserAttributes({
				UserPoolId: process.env.COGNITO_USER_POOL_ID!,
				Username: user.username,
				UserAttributes: [{ Name: 'name', Value: updates.name }],
			});
		}
	},

	async deleteUser(userId: string): Promise<void> {
		try {
			await userRepository.deleteUser(userId);
		} catch (error: any) {
			console.error('Error:', error);
			if (error.name === 'ConditionalCheckFailedException') {
				throw new NotFoundError('User not found');
			}
			throw error;
		}
	},

	async getAllUsers(): Promise<User[]> {
		return await userRepository.getAllUsers();
	},

	async deleteUserAndData(userId: string): Promise<void> {
		const itemsToDelete = await userRepository.getAllUserItems(userId);

		await userRepository.deleteItems(itemsToDelete);
	},
};
