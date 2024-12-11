import { APIGatewayProxyHandler } from 'aws-lambda';
import { listService } from '../services/list-service';
import { AppError, BadRequestError, ForbiddenError } from '../utils/error-util';
import {
	createListSchema,
	deleteListSchema,
	getListsSchema,
	updateListSchema,
	addExerciseToListSchema,
	removeExerciseFromListSchema,
} from '../utils/validation-util';
import { List } from '../models/list-model';

export const createList: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const body = JSON.parse(event.body || '{}');
		const { error } = createListSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const list = await listService.createList(userId, body.title, body.description, body.exerciseId, body.visibility, body.sharedWith);
		return {
			statusCode: 201,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(list),
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

export const deleteList: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const queryParams = event.queryStringParameters || {};
		const { error } = deleteListSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const list = await listService.getList(userId, queryParams.listId!);
		if (!list || list.userId !== userId) {
			throw new ForbiddenError('You do not have permission to delete this list');
		}
		await listService.deleteList(userId, queryParams.listId!);
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'List deleted' }),
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

export const getLists: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const queryParams = event.queryStringParameters || {};
		const { error } = getListsSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		if (queryParams.userId) {
			const lists = await listService.getListsForUser(userId, queryParams.userId);
			return {
				statusCode: 200,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(lists),
			};
		} else {
			const relevantLists = await listService.getRelevantLists(userId);
			return {
				statusCode: 200,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(relevantLists),
			};
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

export const updateList: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const body = JSON.parse(event.body || '{}');
		const { error } = updateListSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const updates: Partial<List> = {};
		if (body.title) updates.title = body.title;
		if (body.description) updates.description = body.description;
		if (body.visibility) updates.visibility = body.visibility;
		if (body.sharedWith) updates.sharedWith = body.sharedWith;
		if (Object.keys(updates).length === 0) {
			throw new BadRequestError('At least one field required for update');
		}
		const list = await listService.getList(userId, body.listId);
		if (!list || list.userId !== userId) {
			throw new ForbiddenError('You do not have permission to update this list');
		}
		await listService.updateList(userId, body.listId, updates);
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'List updated' }),
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

export const addExerciseToList: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const listId = event.pathParameters?.listId;
		const body = JSON.parse(event.body || '{}');
		const { error } = addExerciseToListSchema.validate({ listId, ...body });
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const list = await listService.getList(userId, listId!);
		if (!list || list.userId !== userId) {
			throw new ForbiddenError('You do not have permission to modify this list');
		}
		await listService.addExerciseToList(userId, listId!, body.exerciseId);
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Exercise added to list' }),
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

export const removeExerciseFromList: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const listId = event.pathParameters?.listId;
		const queryParams = event.queryStringParameters || {};
		const { error } = removeExerciseFromListSchema.validate({ listId, ...queryParams });
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const list = await listService.getList(userId, listId!);
		if (!list || list.userId !== userId) {
			throw new ForbiddenError('You do not have permission to modify this list');
		}
		await listService.removeExerciseFromList(userId, listId!, queryParams.exerciseId!);
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Exercise removed from list' }),
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
