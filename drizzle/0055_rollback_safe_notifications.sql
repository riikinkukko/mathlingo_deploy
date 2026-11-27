-- Preserve the original rows and their foreign key. Old application builds read the filtered name.
ALTER TABLE notifications RENAME TO notification_records;
--> statement-breakpoint
ALTER TABLE notification_records RENAME CONSTRAINT notifications_user_id_users_id_fk TO notification_records_user_id_users_id_fk;
--> statement-breakpoint
CREATE VIEW notifications AS
SELECT n.* FROM notification_records n
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = n.user_id AND u.role = 'PARENT'
) OR EXISTS (
  SELECT 1 FROM parent_links p
  WHERE p.parent_id = n.user_id AND n.link = '/parent/child/' || p.student_id
);
