import { followerRepository } from '../repositories/follower-repository';
import { userRepository } from '../repositories/user-repository';
import { listRepository } from '../repositories/list-repository';
import { NotFoundError, BadRequestError } from '../utils/error-util';

export const followerService = {
	async createFollower(selfUserId: string, userId?: string, listId?: string): Promise<void> {
		if (userId && listId) {
			throw new BadRequestError('Cannot follow both user and list at the same time');
		}
		if (!userId && !listId) {
			throw new BadRequestError('Must provide either userId or listId to follow');
		}
		if (userId) {
			const user = await userRepository.getUser(userId);
			if (!user) {
				throw new NotFoundError('User not found');
			}
			await followerRepository.createUserFollower(userId, selfUserId);
			await followerRepository.incrementUserFollowerCount(userId);
		} else if (listId) {
			const list = await listRepository.getListById(listId);
			if (!list) {
				throw new NotFoundError('List not found');
			}
			await followerRepository.createListFollower(listId, selfUserId);
			await followerRepository.incrementListFollowerCount(list.userId, list.listId);
		}
	},

	async deleteFollower(selfUserId: string, userId?: string, listId?: string): Promise<void> {
		if (userId && listId) {
			throw new BadRequestError('Cannot unfollow both user and list at the same time');
		}
		if (!userId && !listId) {
			throw new BadRequestError('Must provide either userId or listId to unfollow');
		}
		if (userId) {
			const user = await userRepository.getUser(userId);
			if (!user) {
				throw new NotFoundError('User not found');
			}
			await followerRepository.deleteUserFollower(userId, selfUserId);
			await followerRepository.decrementUserFollowerCount(userId);
		} else if (listId) {
			const list = await listRepository.getListById(listId);
			if (!list) {
				throw new NotFoundError('List not found');
			}
			await followerRepository.deleteListFollower(listId, selfUserId);
			await followerRepository.decrementListFollowerCount(list.userId, list.listId);
		}
	},

	async getFollowers(
		userId?: string,
		listId?: string
	): Promise<{
		followers: { userId: string; name: string; profilePhotoUrl?: string }[];
		followings?: { userId: string; name: string; profilePhotoUrl?: string }[];
	}> {
		if (userId && listId) {
			throw new BadRequestError('Cannot get followers for both user and list at the same time');
		}
		if (!userId && !listId) {
			throw new BadRequestError('Must provide either userId or listId to get followers');
		}

		let followers: { userId: string; name: string; profilePhotoUrl?: string }[] = [];
		let followings: { userId: string; name: string; profilePhotoUrl?: string }[] | undefined = undefined;

		if (userId) {
			const userFollowers = await followerRepository.getUserFollowers(userId);
			userFollowers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			const followerUserIds = userFollowers.map((f) => f.followerUserId);
			const followerUsers = await userRepository.getUsersByIds(followerUserIds);
			const followerMap = new Map(followerUsers.map((u) => [u.userId, u]));

			followers = userFollowers.map((f) => {
				const user = followerMap.get(f.followerUserId);
				if (!user) throw new NotFoundError(`User not found for follower ${f.followerUserId}`);
				return { userId: user.userId, name: user.name, profilePhotoUrl: user.profilePhotoUrl };
			});

			const userFollowing = await followerRepository.getUserFollowings(userId);
			userFollowing.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			const followingUserIds = userFollowing.map((f) => f.followedUserId);
			const followingUsers = await userRepository.getUsersByIds(followingUserIds);
			const followingMap = new Map(followingUsers.map((u) => [u.userId, u]));

			followings = userFollowing.map((f) => {
				const user = followingMap.get(f.followedUserId);
				if (!user) throw new NotFoundError(`User not found for following ${f.followedUserId}`);
				return { userId: user.userId, name: user.name, profilePhotoUrl: user.profilePhotoUrl };
			});
		} else if (listId) {
			const listFollowers = await followerRepository.getListFollowers(listId);
			listFollowers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			const followerUserIds = listFollowers.map((f) => f.followerUserId);
			const followerUsers = await userRepository.getUsersByIds(followerUserIds);
			const followerMap = new Map(followerUsers.map((u) => [u.userId, u]));

			followers = listFollowers.map((f) => {
				const user = followerMap.get(f.followerUserId);
				if (!user) throw new NotFoundError(`User not found for follower ${f.followerUserId}`);
				return { userId: user.userId, name: user.name, profilePhotoUrl: user.profilePhotoUrl };
			});
		}

		return { followers, followings };
	},
};
