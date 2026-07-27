-- Drop unused indexes flagged by InsForge Advisor
-- All have 0 scans since creation and only add write overhead.
-- Using CONCURRENTLY to avoid locking writes during the operation.

DROP INDEX CONCURRENTLY IF EXISTS public.idx_restaurant_tables_branch_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_profiles_role;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_menu_items_is_active;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_menu_items_active;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_bookings_dates;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_bookings_status;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_bookings_guest;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rooms_branch_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_expenses_recorded_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_order_batch_items_voided_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_invoices_booking_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_order_batches_user_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_bookings_user_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_payments_user_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_table_sessions_created;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rooms_status_payment;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_expenses_category;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_customers_phone;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_bookings_room;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_invoices_user_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_payments_method;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_customers_active;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_table_sessions_closed_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_expense_categories_active;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_activity_logs_type;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_customers_email;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rooms_status;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_menu_items_is_available;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_invoices_table_status;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_menu_categories_active;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_menu_categories_display_order;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_menu_items_category_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rooms_room_type_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_activity_logs_entity;
