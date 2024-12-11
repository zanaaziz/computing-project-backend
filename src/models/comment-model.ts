export interface Comment {
	PK: string;
	SK: string;
	commentId: string;
	exerciseId: string;
	userId: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

export interface CommentResponse {
	commentId: string;
	exerciseId: string;
	userId: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	user: {
		name: string;
		profilePhotoUrl?: string;
	};
}
