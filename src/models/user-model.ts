export interface User {
	userId: string;
	username: string;
	name: string;
	email: string;
	createdAt: string;
	updatedAt: string;
	followerCount: number;
	profilePhotoUrl?: string;
	coverPhotoUrl?: string;
}
