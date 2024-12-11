export interface Exercise {
	PK: string;
	SK: string;
	exerciseId: string;
	name: string;
	force: string | null;
	level: string;
	mechanic: string | null;
	equipment: string | null;
	primaryMuscles: string[];
	secondaryMuscles: string[];
	instructions: string[];
	category: string;
	images: string[];
	likeCount: number;
	commentCount: number;
	createdAt: string;
	updatedAt: string;
	GSI1PK: string;
	GSI1SK: string;
}
