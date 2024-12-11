export interface List {
	PK: string;
	SK: string;
	listId: string;
	userId: string;
	title: string;
	description: string;
	exercises: string[];
	visibility: 'public' | 'private' | 'shared';
	sharedWith: string[];
	createdAt: string;
	updatedAt: string;
	followerCount: number;
	GSI3PK: string;
	GSI3SK: string;
}
