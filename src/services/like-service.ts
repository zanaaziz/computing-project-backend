import { likeRepository } from '../repositories/like-repository';
import { exerciseRepository } from '../repositories/exercise-repository';
import { NotFoundError } from '../utils/error-util';

export const likeService = {
	async likeExercise(exerciseId: string, userId: string): Promise<void> {
		const exercise = await exerciseRepository.getExercise(exerciseId);
		if (!exercise) {
			throw new NotFoundError('Exercise not found');
		}

		await likeRepository.createLike(exerciseId, userId);
		await likeRepository.incrementLikeCount(exerciseId);
	},

	async unlikeExercise(exerciseId: string, userId: string): Promise<void> {
		const exercise = await exerciseRepository.getExercise(exerciseId);
		if (!exercise) {
			throw new NotFoundError('Exercise not found');
		}

		await likeRepository.deleteLike(exerciseId, userId);
		await likeRepository.decrementLikeCount(exerciseId);
	},
};
