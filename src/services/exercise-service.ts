import { exerciseRepository } from '../repositories/exercise-repository';
import { likeRepository } from '../repositories/like-repository';

export const exerciseService = {
	async getAllExercises(filters: any, page: number, pageSize: number, userId?: string): Promise<any> {
		const allFilteredExercises = await exerciseRepository.getAllExercises(filters);

		const start = (page - 1) * pageSize;
		const end = start + pageSize;

		const paginatedCachedExercises = allFilteredExercises.slice(start, end);

		const exerciseIds = paginatedCachedExercises.map((ex) => ex.exerciseId);

		const latestExercises = await exerciseRepository.getExercisesByIds(exerciseIds);

		const exerciseMap = new Map(latestExercises.map((ex) => [ex.exerciseId, ex]));

		let paginatedExercises = paginatedCachedExercises.map((cachedEx) => exerciseMap.get(cachedEx.exerciseId) || cachedEx);

		await exerciseRepository.updateCachedExercises(latestExercises);

		if (userId) {
			const likedExerciseIds = await likeRepository.getUserLikedExerciseIds(userId);
			const likedSet = new Set(likedExerciseIds);
			paginatedExercises = paginatedExercises.map((exercise) => ({
				...exercise,
				isLiked: likedSet.has(exercise.exerciseId),
			}));
		}

		return {
			total: allFilteredExercises.length,
			page,
			pageSize,
			data: paginatedExercises,
		};
	},
};
