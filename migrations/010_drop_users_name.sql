-- Drop the redundant `name` column. The officer's name is now stored as
-- first_name + last_name (introduced in 009). Any remaining display use of
-- `user.name` has been replaced with `${first_name} ${last_name}` in the app.
ALTER TABLE users DROP COLUMN IF EXISTS name;
