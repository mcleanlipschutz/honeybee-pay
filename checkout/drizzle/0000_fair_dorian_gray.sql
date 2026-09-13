CREATE TABLE `checkout_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`amount_units` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`after_block` integer NOT NULL,
	`tx_hash` text,
	`candidate_hash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_payments_tx` ON `checkout_payments` (`tx_hash`);--> statement-breakpoint
CREATE INDEX `checkout_payments_owner_created` ON `checkout_payments` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `checkout_payments_pending` ON `checkout_payments` (`status`,`checked_at`);