ALTER TABLE record_receipt ADD CONSTRAINT record_receipt_owner_fkey FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;
