CREATE TABLE `repertoire_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`repertoire_id` text NOT NULL,
	`user_id` text NOT NULL,
	`fen` text NOT NULL,
	`move` text NOT NULL,
	`parent_id` text,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`interval` integer DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`next_due` integer,
	`last_reviewed` integer,
	FOREIGN KEY (`repertoire_id`) REFERENCES `repertoires`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `repertoire_positions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `repertoire_positions_user_id_idx` ON `repertoire_positions` (`user_id`);--> statement-breakpoint
CREATE INDEX `repertoire_positions_repertoire_id_idx` ON `repertoire_positions` (`repertoire_id`);--> statement-breakpoint
CREATE INDEX `repertoire_positions_parent_id_idx` ON `repertoire_positions` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `repertoire_positions_rep_parent_move_unique` ON `repertoire_positions` (`repertoire_id`,`parent_id`,`move`);--> statement-breakpoint
CREATE TABLE `repertoires` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`colour` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `repertoires_user_id_idx` ON `repertoires` (`user_id`);