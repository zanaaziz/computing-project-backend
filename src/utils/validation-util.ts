import Joi from 'joi';

export const refreshTokenSchema = Joi.object({
	refreshToken: Joi.string().required(),
});

export const registerSchema = Joi.object({
	email: Joi.string().email().required(),
	password: Joi.string().min(8).required(),
	name: Joi.string().required(),
});

export const loginSchema = Joi.object({
	email: Joi.string().email().required(),
	password: Joi.string().min(8).required(),
});

export const confirmEmailSchema = Joi.object({
	email: Joi.string().email().required(),
	code: Joi.string().required(),
});

export const patchUserSchema = Joi.object({
	name: Joi.string().required(),
});

export const patchPasswordSchema = Joi.object({
	currentPassword: Joi.string().min(8).required(),
	newPassword: Joi.string().min(8).required(),
});

export const patchEmailSchema = Joi.object({
	newEmail: Joi.string().email().required(),
});

export const verifyEmailSchema = Joi.object({
	newEmail: Joi.string().email().required(),
	verificationCode: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
	email: Joi.string().email().required(),
});

export const confirmForgotPasswordSchema = Joi.object({
	email: Joi.string().email().required(),
	verificationCode: Joi.string().required(),
	newPassword: Joi.string().min(8).required(),
});

export const resendConfirmationCodeSchema = Joi.object({
	username: Joi.string().required(),
});

export const createLikeSchema = Joi.object({
	exerciseId: Joi.string().required(),
});

export const deleteLikeSchema = Joi.object({
	exerciseId: Joi.string().required(),
});

export const createCommentSchema = Joi.object({
	exerciseId: Joi.string().required(),
	content: Joi.string().required(),
});

export const deleteCommentSchema = Joi.object({
	commentId: Joi.string().required(),
});

export const getCommentsSchema = Joi.object({
	exerciseId: Joi.string(),
	commentId: Joi.string(),
}).xor('exerciseId', 'commentId');

export const createListSchema = Joi.object({
	title: Joi.string().required(),
	description: Joi.string().optional(),
	exerciseId: Joi.string().required(),
	visibility: Joi.string().valid('public', 'private', 'shared').required(),
	sharedWith: Joi.array().items(Joi.string()).optional(),
});

export const deleteListSchema = Joi.object({
	listId: Joi.string().required(),
});

export const getListsSchema = Joi.object({
	userId: Joi.string().optional(),
});

export const updateListSchema = Joi.object({
	listId: Joi.string().required(),
	title: Joi.string().optional(),
	description: Joi.string().optional(),
	visibility: Joi.string().valid('public', 'private', 'shared').optional(),
	sharedWith: Joi.array().items(Joi.string()).optional(),
});

export const addExerciseToListSchema = Joi.object({
	listId: Joi.string().required(),
	exerciseId: Joi.string().required(),
});

export const removeExerciseFromListSchema = Joi.object({
	listId: Joi.string().required(),
	exerciseId: Joi.string().required(),
});

export const createFollowerSchema = Joi.object({
	userId: Joi.string().optional(),
	listId: Joi.string().optional(),
}).xor('userId', 'listId');

export const deleteFollowerSchema = Joi.object({
	userId: Joi.string().optional(),
	listId: Joi.string().optional(),
}).xor('userId', 'listId');

export const getFollowersSchema = Joi.object({
	userId: Joi.string().optional(),
	listId: Joi.string().optional(),
}).xor('userId', 'listId');

const commaSeparated = (validValues: string[]) => {
	return Joi.string()
		.custom((value, helpers) => {
			if (!value) return [];
			const items = value.split(',').map((v: string) => v.trim().toLowerCase());
			for (const item of items) {
				if (!validValues.includes(item)) {
					return helpers.error('string.invalid', { value: item });
				}
			}
			return items;
		}, 'comma separated validation')
		.allow('')
		.optional();
};

const validForces = ['static', 'pull', 'push'];
const validLevels = ['beginner', 'intermediate', 'expert'];
const validMechanics = ['isolation', 'compound'];
const validCategories = ['powerlifting', 'strength', 'stretching', 'cardio', 'olympic weightlifting', 'strongman', 'plyometrics'];
const validEquipment = [
	'medicine ball',
	'dumbbell',
	'body only',
	'bands',
	'kettlebells',
	'foam roll',
	'cable',
	'machine',
	'barbell',
	'exercise ball',
	'e-z curl bar',
	'other',
];
const validMuscles = [
	'abdominals',
	'abductors',
	'adductors',
	'biceps',
	'calves',
	'chest',
	'forearms',
	'glutes',
	'hamstrings',
	'lats',
	'lower back',
	'middle back',
	'neck',
	'quadriceps',
	'shoulders',
	'traps',
	'triceps',
];

export const exerciseFiltersSchema = Joi.object({
	aiQuery: Joi.string().optional(),
	name: Joi.string().optional(),
	force: commaSeparated(validForces),
	level: commaSeparated(validLevels),
	mechanic: commaSeparated(validMechanics),
	equipment: commaSeparated(validEquipment),
	muscle: commaSeparated(validMuscles),
	category: commaSeparated(validCategories),
	page: Joi.number().integer().min(1).default(1),
	pageSize: Joi.number().integer().min(1).max(100).default(20),
});
