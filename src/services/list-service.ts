import { listRepository } from '../repositories/list-repository';
import { List } from '../models/list-model';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError, NotFoundError } from '../utils/error-util';
import { userRepository } from '../repositories/user-repository';
import { exerciseRepository } from '../repositories/exercise-repository';
import { likeRepository } from '../repositories/like-repository';

async function enrichLists(lists: List[], userId: string): Promise<any[]> {
	if (lists.length === 0) return [];

	const allExerciseIds = [...new Set(lists.flatMap((list) => list.exercises))];
	const exercises = await exerciseRepository.getExercisesByIds(allExerciseIds);
	const exerciseMap = new Map(exercises.map((ex) => [ex.exerciseId, ex]));
	const likedExerciseIds = await likeRepository.getUserLikedExerciseIds(userId);
	const likedSet = new Set(likedExerciseIds);

	const allSharedWithUserIds = [...new Set(lists.flatMap((list) => list.sharedWith))];
	const sharedWithUsers = await userRepository.getUsersByIds(allSharedWithUserIds);
	const sharedWithUserMap = new Map(sharedWithUsers.map((u) => [u.userId, { userId: u.userId, name: u.name, profilePhotoUrl: u.profilePhotoUrl }]));

	return lists.map((list) => {
		const detailedExercises = list.exercises
			.map((exId) => {
				const exercise = exerciseMap.get(exId);
				if (!exercise) return null;
				return { ...exercise, isLiked: likedSet.has(exId) };
			})
			.filter((ex) => ex !== null);

		const sharedWithDetails = list.sharedWith.map((userId) => sharedWithUserMap.get(userId)).filter((user) => user !== undefined);

		return {
			...list,
			exercises: detailedExercises,
			sharedWith: sharedWithDetails,
		};
	});
}

export const listService = {
	async createList(
		userId: string,
		title: string,
		description: string,
		exerciseId: string,
		visibility: 'public' | 'private' | 'shared',
		sharedWith: string[] = []
	): Promise<List> {
		const listId = uuidv4();
		const now = new Date().toISOString();
		const list: List = {
			PK: `USER#${userId}`,
			SK: `LIST#${listId}`,
			listId,
			userId,
			title,
			description,
			exercises: [exerciseId],
			visibility,
			sharedWith: visibility === 'shared' ? sharedWith : [],
			createdAt: now,
			updatedAt: now,
			followerCount: 0,
			GSI3PK: listId,
			GSI3SK: 'METADATA',
		};

		await listRepository.createList(list);
		return list;
	},

	async deleteList(userId: string, listId: string): Promise<void> {
		const list = await listRepository.getList(userId, listId);
		if (!list) {
			throw new NotFoundError('List not found');
		}
		await listRepository.deleteList(userId, listId);
	},

	async getRelevantLists(userId: string): Promise<any[]> {
		const ownedLists = await listRepository.getOwnedLists(userId);
		const followedLists = await listRepository.getFollowedLists(userId);
		const sharedLists = await listRepository.getSharedLists(userId);

		const allLists = [
			...ownedLists.map((list) => ({ list, relationship: 'owned' as const })),
			...followedLists.map((list) => ({ list, relationship: 'following' as const })),
			...sharedLists.map((list) => ({ list, relationship: 'shared' as const })),
		];

		const uniqueLists = allLists.reduce((acc, current) => {
			if (!acc.find((item) => item.list.listId === current.list.listId)) {
				acc.push(current);
			}
			return acc;
		}, [] as { list: List; relationship: 'owned' | 'following' | 'shared' }[]);

		uniqueLists.sort((a, b) => b.list.createdAt.localeCompare(a.list.createdAt));

		const listsToEnrich = uniqueLists.map((item) => item.list);
		const enrichedLists = await enrichLists(listsToEnrich, userId);

		const userIds = [...new Set(enrichedLists.map((list) => list.userId))];
		const users = await userRepository.getUsersByIds(userIds);
		const userMap = new Map(users.map((u) => [u.userId, u]));

		return uniqueLists.map((item, index) => {
			const enrichedList = enrichedLists[index];
			const user = userMap.get(enrichedList.userId);
			if (!user) {
				throw new NotFoundError(`User not found for list ${enrichedList.listId}`);
			}
			return {
				list: enrichedList,
				relationship: item.relationship,
				user: {
					name: user.name,
					profilePhotoUrl: user.profilePhotoUrl,
				},
			};
		});
	},

	async getListsForUser(authUserId: string, targetUserId: string): Promise<any[]> {
		const publicLists = await listRepository.getPublicListsByUser(targetUserId);

		const followedLists = await listRepository.getFollowedLists(authUserId);

		const sharedLists = await listRepository.getSharedListsByUser(targetUserId, authUserId);

		const publicListsWithRelationship = publicLists.map((list) => ({
			list,
			relationship: followedLists.some((fl) => fl.listId === list.listId) ? 'following' : 'public',
		}));

		const sharedListsWithRelationship = sharedLists.map((list) => ({
			list,
			relationship: 'shared',
		}));

		const allLists = [...publicListsWithRelationship, ...sharedListsWithRelationship];

		const uniqueListsMap = new Map();

		allLists.forEach((item) => {
			if (!uniqueListsMap.has(item.list.listId) || item.relationship === 'shared') {
				uniqueListsMap.set(item.list.listId, item);
			}
		});
		const uniqueLists = Array.from(uniqueListsMap.values());

		uniqueLists.sort((a, b) => b.list.createdAt.localeCompare(a.list.createdAt));
		const listsToEnrich = uniqueLists.map((item) => item.list);
		const enrichedLists = await enrichLists(listsToEnrich, authUserId);

		const userIds = [...new Set(enrichedLists.map((list) => list.userId))];
		const users = await userRepository.getUsersByIds(userIds);
		const userMap = new Map(users.map((u) => [u.userId, u]));

		return uniqueLists.map((item, index) => {
			const enrichedList = enrichedLists[index];
			const user = userMap.get(enrichedList.userId);
			if (!user) {
				throw new NotFoundError(`User not found for list ${enrichedList.listId}`);
			}
			return {
				list: enrichedList,
				relationship: item.relationship,
				user: {
					name: user.name,
					profilePhotoUrl: user.profilePhotoUrl,
				},
			};
		});
	},

	async updateList(userId: string, listId: string, updates: Partial<List>): Promise<void> {
		const list = await listRepository.getList(userId, listId);
		if (!list) {
			throw new NotFoundError('List not found');
		}
		await listRepository.updateList(userId, listId, updates);
	},

	async addExerciseToList(userId: string, listId: string, exerciseId: string): Promise<void> {
		try {
			const list = await listRepository.getList(userId, listId);
			if (!list) {
				throw new NotFoundError('List not found');
			}
			await listRepository.addExerciseToList(userId, listId, exerciseId);
		} catch (error: any) {
			console.error('Error:', error);
			if (error.name === 'ConditionalCheckFailedException') {
				throw new BadRequestError('Exercise already exists in the list');
			}
			throw error;
		}
	},

	async removeExerciseFromList(userId: string, listId: string, exerciseId: string): Promise<void> {
		const list = await listRepository.getList(userId, listId);
		if (!list) {
			throw new NotFoundError('List not found');
		}
		await listRepository.removeExerciseFromList(userId, listId, exerciseId);
	},

	async getList(userId: string, listId: string): Promise<List | null> {
		return await listRepository.getList(userId, listId);
	},

	async canFollowList(userId: string, listId: string): Promise<boolean> {
		const list = await listRepository.getListById(listId);
		if (!list) {
			return false;
		}
		if (list.visibility === 'public') {
			return true;
		}
		if (list.visibility === 'shared' && list.sharedWith.includes(userId)) {
			return true;
		}
		if (list.userId === userId) {
			return true;
		}
		return false;
	},
};
