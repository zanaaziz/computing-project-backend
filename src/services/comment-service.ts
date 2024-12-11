import { commentRepository } from '../repositories/comment-repository';
import { exerciseRepository } from '../repositories/exercise-repository';
import { Comment, CommentResponse } from '../models/comment-model';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError, NotFoundError } from '../utils/error-util';
import { User } from '../models/user-model';
import { userRepository } from '../repositories/user-repository';

export const commentService = {
	async createComment(exerciseId: string, userId: string, content: string): Promise<Comment> {
		const exercise = await exerciseRepository.getExercise(exerciseId);
		if (!exercise) {
			throw new NotFoundError('Exercise not found');
		}
		const commentId = uuidv4();
		const now = new Date().toISOString();
		const comment: Comment = {
			PK: `EXERCISE#${exerciseId}`,
			SK: `COMMENT#${commentId}`,
			commentId,
			exerciseId,
			userId,
			content,
			createdAt: now,
			updatedAt: now,
		};
		await commentRepository.putComment(comment);
		await commentRepository.incrementCommentCount(exerciseId);
		return comment;
	},

	async deleteComment(commentId: string): Promise<void> {
		const comment = await commentRepository.getCommentBySK(`COMMENT#${commentId}`);
		if (!comment) {
			throw new NotFoundError('Comment not found');
		}
		await commentRepository.deleteComment(comment.PK, comment.SK);
		await commentRepository.decrementCommentCount(comment.exerciseId);
	},

	async getComments(exerciseId?: string, commentId?: string): Promise<CommentResponse | CommentResponse[]> {
		const transformComment = (comment: Comment, user: User): CommentResponse => ({
			commentId: comment.commentId,
			exerciseId: comment.exerciseId,
			userId: comment.userId,
			content: comment.content,
			createdAt: comment.createdAt,
			updatedAt: comment.updatedAt,
			user: {
				name: user.name,
				profilePhotoUrl: user.profilePhotoUrl,
			},
		});

		if (commentId) {
			const comment = await commentRepository.getCommentBySK(`COMMENT#${commentId}`);
			if (!comment) {
				throw new NotFoundError('Comment not found');
			}
			const users = await userRepository.getUsersByIds([comment.userId]);
			if (users.length === 0) {
				throw new NotFoundError('User not found for comment');
			}
			const user = users[0];
			return transformComment(comment, user);
		} else if (exerciseId) {
			const comments = await commentRepository.getCommentsByExercise(exerciseId);
			if (comments.length === 0) {
				return [];
			}

			comments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

			const userIds = [...new Set(comments.map((c) => c.userId))];
			const users = await userRepository.getUsersByIds(userIds);
			const userMap = new Map(users.map((u) => [u.userId, u]));
			return comments.map((comment) => {
				const user = userMap.get(comment.userId);
				if (!user) {
					throw new NotFoundError(`User not found for comment ${comment.commentId}`);
				}
				return transformComment(comment, user);
			});
		} else {
			throw new BadRequestError('Missing exerciseId or commentId');
		}
	},
};
