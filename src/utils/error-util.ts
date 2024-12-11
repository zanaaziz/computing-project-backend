export class AppError extends Error {
	public readonly statusCode: number;
	public readonly code: string;

	constructor(message: string, statusCode: number, code: string) {
		super(message);
		this.statusCode = statusCode;
		this.code = code;
	}
}

export class AuthenticationError extends AppError {
	constructor(message: string) {
		super(message, 401, 'UNAUTHORIZED');
	}
}

export class ForbiddenError extends AppError {
	constructor(message: string) {
		super(message, 403, 'FORBIDDEN');
	}
}

export class NotFoundError extends AppError {
	constructor(message: string) {
		super(message, 404, 'NOT_FOUND');
	}
}

export class BadRequestError extends AppError {
	constructor(message: string) {
		super(message, 400, 'BAD_REQUEST');
	}
}
