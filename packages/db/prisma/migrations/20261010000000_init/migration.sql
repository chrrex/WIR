-- WIR · Init-Migration (aus prisma/schema.prisma erzeugt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "ReadListVisibility" AS ENUM ('AUTHOR_AND_LEADS', 'ALL_RECIPIENTS');

-- CreateEnum
CREATE TYPE "CompanyKind" AS ENUM ('FOUNDATION', 'LOCATION', 'LEGAL_ENTITY');

-- CreateEnum
CREATE TYPE "AppModule" AS ENUM ('NEWS', 'SOCIAL', 'CHAT', 'KNOWLEDGE', 'DOCUMENTS', 'TASKS', 'CHECKLISTS', 'HANDOVERS', 'SHIFTS', 'OCCUPANCY', 'EVENTS', 'SURVEYS', 'IDEAS', 'CONTACTS', 'TEAM');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PROVISIONED', 'INVITED', 'ACTIVE', 'LOCKED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('EMPLOYEE', 'EXTERNAL', 'SERVICE');

-- CreateEnum
CREATE TYPE "MfaFactorType" AS ENUM ('TOTP', 'WEBAUTHN');

-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('DEPARTMENT', 'TEAM', 'LOCATION', 'PROJECT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('LOCAL', 'GASTROMATIC', 'EVENT_TOOL', 'FLEXKEEPING', 'REVIEW_TOOL', 'MICROSOFT_365', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "IntegrationCategory" AS ENUM ('PERSONNEL', 'EVENTS', 'HOUSEKEEPING', 'REVIEWS', 'PRODUCTIVITY', 'LEARNING', 'OTHER');

-- CreateEnum
CREATE TYPE "ApiClientStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('POST', 'HANDOVER', 'KNOWLEDGE_ARTICLE', 'DOCUMENT', 'SURVEY', 'TASK', 'CHECKLIST_RUN', 'IDEA');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'DEACTIVATED', 'DELETED');

-- CreateEnum
CREATE TYPE "Importance" AS ENUM ('NORMAL', 'IMPORTANT');

-- CreateEnum
CREATE TYPE "AudienceTargetType" AS ENUM ('ALL_USERS', 'COMPANY', 'GROUP', 'ROLE', 'USER');

-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('ALL_USERS', 'COMPANY', 'GROUP', 'ROLE', 'USER');

-- CreateEnum
CREATE TYPE "ResourceAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'DEACTIVATE', 'DOWNLOAD', 'MANAGE');

-- CreateEnum
CREATE TYPE "RecipientReason" AS ENUM ('AUDIENCE', 'LATE_JOIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReminderTrigger" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'SKIPPED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('NEWS', 'SOCIAL');

-- CreateEnum
CREATE TYPE "SocialCategory" AS ENUM ('GREETINGS', 'MARKETPLACE', 'CONGRATULATIONS', 'LEISURE', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketplaceIntent" AS ENUM ('OFFER', 'SEARCH');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('ATTACHMENT', 'IMAGE', 'VIDEO', 'INLINE_IMAGE');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "TranslatableEntity" AS ENUM ('CONTENT_ITEM', 'KNOWLEDGE_VERSION', 'COMMENT', 'CHAT_MESSAGE', 'CHECKLIST_ITEM', 'CHECKLIST_RUN_ITEM', 'SURVEY_QUESTION', 'SURVEY_OPTION');

-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "KnowledgeArticleType" AS ENUM ('WIKI', 'SOP', 'POLICY', 'BRAND_STANDARD', 'HACCP', 'PROCESS', 'MANUAL', 'TEMPLATE_FORM');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('GENERAL', 'SHIFT', 'HACCP', 'EVENT', 'ONBOARDING', 'OFFBOARDING', 'AUDIT');

-- CreateEnum
CREATE TYPE "ChecklistResponseType" AS ENUM ('CHECK', 'YES_NO', 'TEXT', 'NUMBER', 'TEMPERATURE', 'PHOTO');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LifecycleKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResponsibleType" AS ENUM ('SUBJECT_EMPLOYEE', 'LINE_MANAGER', 'USER', 'GROUP', 'ROLE');

-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SCALE', 'FREE_TEXT');

-- CreateEnum
CREATE TYPE "SurveyResultsVisibility" AS ENUM ('AUTHOR_ONLY', 'RECIPIENTS_AFTER_SUBMIT', 'RECIPIENTS_AFTER_CLOSE');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'IN_PROGRESS', 'IMPLEMENTED', 'PARKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('ABSENT', 'VACATION', 'BUSINESS_TRIP', 'TRAINING');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('SUPPLIER', 'PARTNER', 'MAINTENANCE', 'SERVICE_PROVIDER', 'AUTHORITY', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'ACTIVE', 'DEGRADED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ExternalEntityType" AS ENUM ('EVENT', 'ROOM_ALLOCATION', 'OCCUPANCY_DAY', 'ARRIVALS_DAY', 'DEPARTURES_DAY', 'SHIFT', 'REVIEW', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "kind" "CompanyKind" NOT NULL DEFAULT 'LEGAL_ENTITY',
    "read_list_visibility" "ReadListVisibility" NOT NULL DEFAULT 'AUTHOR_AND_LEADS',
    "parent_id" UUID,
    "disabled_modules" "AppModule"[] DEFAULT ARRAY[]::"AppModule"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_brandings" (
    "company_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "primary_color" TEXT NOT NULL,
    "surface_color" TEXT,
    "primary_dark" TEXT,
    "primary_tint" TEXT,
    "accent_color" TEXT,
    "logo_file_id" UUID,
    "logo_inverse_file_id" UUID,
    "logo_requires_white" BOOLEAN NOT NULL DEFAULT false,
    "favicon_file_id" UUID,
    "footer_text" TEXT,
    "custom_domain" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_brandings_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "email" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "recovery_email" TEXT,
    "recovery_email_verified_at" TIMESTAMPTZ(6),
    "display_name" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "password_hash" TEXT,
    "password_changed_at" TIMESTAMPTZ(6),
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "activated_at" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "mfa_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_resets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "issued_by_id" UUID,
    "token_hash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_factors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "MfaFactorType" NOT NULL,
    "label" TEXT,
    "secret_encrypted" BYTEA,
    "credential_id" TEXT,
    "public_key" BYTEA,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "line_manager_id" UUID,
    "personnel_number" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "job_title" TEXT,
    "phone_work" TEXT,
    "about_me" TEXT,
    "avatar_file_id" UUID,
    "entry_date" DATE,
    "exit_date" DATE,
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_company_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "job_title" TEXT,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_company_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "parent_group_id" UUID,
    "name" TEXT NOT NULL,
    "type" "GroupType" NOT NULL DEFAULT 'TEAM',
    "description" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_groups" (
    "user_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("user_id","group_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "company_id" UUID,
    "group_id" UUID,
    "granted_by_id" UUID,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ContentType" NOT NULL,
    "company_id" UUID,
    "author_id" UUID,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "importance" "Importance" NOT NULL DEFAULT 'NORMAL',
    "source_locale" TEXT NOT NULL DEFAULT 'de',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "comments_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reactions_enabled" BOOLEAN NOT NULL DEFAULT true,
    "read_tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "requires_acknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "auto_remind_after_hours" INTEGER,
    "remind_interval_hours" INTEGER,
    "max_reminders" INTEGER NOT NULL DEFAULT 2,
    "publish_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_audiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID NOT NULL,
    "target_type" "AudienceTargetType" NOT NULL,
    "company_id" UUID,
    "group_id" UUID,
    "role_id" UUID,
    "user_id" UUID,
    "include_late_joiners" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_recipients" (
    "content_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" "RecipientReason" NOT NULL DEFAULT 'AUDIENCE',
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_recipients_pkey" PRIMARY KEY ("content_item_id","user_id")
);

-- CreateTable
CREATE TABLE "resource_acl" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID,
    "knowledge_category_id" UUID,
    "document_category_id" UUID,
    "contact_category_id" UUID,
    "principal_type" "PrincipalType" NOT NULL,
    "company_id" UUID,
    "group_id" UUID,
    "role_id" UUID,
    "user_id" UUID,
    "actions" "ResourceAction"[],
    "inherit" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_acl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "read_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledged_version" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "read_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "triggered_by_id" UUID,
    "trigger" "ReminderTrigger" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "skip_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID NOT NULL,
    "author_id" UUID,
    "parent_comment_id" UUID,
    "body" JSONB NOT NULL,
    "body_text" TEXT NOT NULL,
    "source_locale" TEXT NOT NULL DEFAULT 'de',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID,
    "comment_id" UUID,
    "user_id" UUID NOT NULL,
    "type" "ReactionType" NOT NULL DEFAULT 'LIKE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentioned_user_id" UUID NOT NULL,
    "content_item_id" UUID,
    "comment_id" UUID,
    "chat_message_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_object_id" UUID NOT NULL,
    "content_item_id" UUID,
    "comment_id" UUID,
    "chat_message_id" UUID,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'ATTACHMENT',
    "caption" TEXT,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" "TranslatableEntity" NOT NULL,
    "entity_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "source_locale" TEXT NOT NULL,
    "target_locale" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_machine" BOOLEAN NOT NULL DEFAULT true,
    "is_plain_language" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "body_text" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinned_until" TIMESTAMPTZ(6),
    "embedded_survey_id" UUID,
    "kind" "PostKind" NOT NULL DEFAULT 'NEWS',
    "social_category" "SocialCategory",
    "marketplace_intent" "MarketplaceIntent",
    "price_label" TEXT,
    "listing_closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handovers" (
    "id" UUID NOT NULL,
    "group_id" UUID,
    "subject" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "body_text" TEXT NOT NULL,
    "shift_date" DATE,
    "shift_label" TEXT,

    CONSTRAINT "handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ChatType" NOT NULL,
    "title" TEXT,
    "direct_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ChatRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "last_read_message_id" UUID,
    "muted_until" TIMESTAMPTZ(6),

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID,
    "reply_to_id" UUID,
    "body" TEXT NOT NULL,
    "source_locale" TEXT NOT NULL DEFAULT 'de',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" TEXT NOT NULL,
    "importance" "Importance" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_path" TEXT,
    "content_item_id" UUID,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "window_start" TEXT,
    "window_end" TEXT,
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
    "min_importance" "Importance",
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "parent_article_id" UUID,
    "article_type" "KnowledgeArticleType" NOT NULL DEFAULT 'WIKI',
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "owner_id" UUID,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "review_due_at" DATE,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "body_text" TEXT NOT NULL,
    "plain_language_text" TEXT,
    "change_summary" TEXT,
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "retention_until" DATE,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_object_id" UUID NOT NULL,
    "change_note" TEXT,
    "extracted_text" TEXT,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tsv" tsvector,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "group_id" UUID,
    "lifecycle_instance_id" UUID,
    "lifecycle_template_step_id" UUID,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "user_id" UUID,
    "group_id" UUID,
    "is_responsible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "group_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ChecklistKind" NOT NULL DEFAULT 'GENERAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "recurrence_rule" TEXT,
    "recurrence_tz" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "next_run_at" TIMESTAMPTZ(6),
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source_locale" TEXT NOT NULL DEFAULT 'de',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "checklist_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "response_type" "ChecklistResponseType" NOT NULL DEFAULT 'CHECK',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "min_value" DECIMAL(10,2),
    "max_value" DECIMAL(10,2),
    "unit" TEXT,
    "knowledge_article_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_runs" (
    "id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "checklist_version" INTEGER NOT NULL,
    "assigned_group_id" UUID,
    "lifecycle_instance_id" UUID,
    "title" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PLANNED',
    "due_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_id" UUID,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "checklist_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_run_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "checklist_item_id" UUID,
    "title_snapshot" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "value_text" TEXT,
    "value_number" DECIMAL(10,2),
    "is_out_of_range" BOOLEAN,
    "photo_file_id" UUID,
    "note" TEXT,
    "completed_by_id" UUID,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "checklist_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "kind" "LifecycleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lifecycle_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_template_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "offset_days" INTEGER NOT NULL DEFAULT 0,
    "responsible_type" "ResponsibleType" NOT NULL,
    "responsible_user_id" UUID,
    "responsible_group_id" UUID,
    "responsible_role_id" UUID,
    "checklist_id" UUID,
    "linked_content_id" UUID,
    "requires_acknowledgement" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lifecycle_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_instances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "kind" "LifecycleKind" NOT NULL,
    "employee_profile_id" UUID NOT NULL,
    "reference_date" DATE NOT NULL,
    "status" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "lifecycle_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "results_visibility" "SurveyResultsVisibility" NOT NULL DEFAULT 'AUTHOR_ONLY',
    "min_group_size" INTEGER NOT NULL DEFAULT 5,
    "opens_at" TIMESTAMPTZ(6),
    "closes_at" TIMESTAMPTZ(6),
    "purpose" TEXT,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "survey_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "SurveyQuestionType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "scale_min" INTEGER,
    "scale_max" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "survey_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_participations" (
    "survey_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "submitted_on" DATE NOT NULL,

    CONSTRAINT "survey_participations_pkey" PRIMARY KEY ("survey_id","user_id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "survey_id" UUID NOT NULL,
    "respondent_id" UUID,
    "submitted_on" DATE NOT NULL,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "response_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id" UUID,
    "value_number" INTEGER,
    "value_text" TEXT,

    CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "idea_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IdeaStatus" NOT NULL DEFAULT 'SUBMITTED',
    "owner_id" UUID,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idea_id" UUID NOT NULL,
    "from_status" "IdeaStatus",
    "to_status" "IdeaStatus" NOT NULL,
    "note" TEXT,
    "changed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "type" "AbsenceType" NOT NULL DEFAULT 'ABSENT',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "show_as_absent" BOOLEAN NOT NULL DEFAULT true,
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "time_zone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "auto_translate" BOOLEAN NOT NULL DEFAULT false,
    "plain_language" BOOLEAN NOT NULL DEFAULT false,
    "font_scale_percent" INTEGER NOT NULL DEFAULT 100,
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "high_contrast" BOOLEAN NOT NULL DEFAULT false,
    "reduced_motion" BOOLEAN NOT NULL DEFAULT false,
    "tts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "social_notifications" BOOLEAN NOT NULL DEFAULT false,
    "show_birthday" BOOLEAN NOT NULL DEFAULT false,
    "birthday_month_day" TEXT,
    "show_work_anniversary" BOOLEAN NOT NULL DEFAULT false,
    "mobile_nav_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "dashboard_widget_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "widget_key" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "default_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dashboard_widget_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "widget_key" TEXT NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "size" TEXT,
    "config" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contact_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "company_id" UUID,
    "type" "ContactType" NOT NULL DEFAULT 'SUPPLIER',
    "organization_name" TEXT NOT NULL,
    "contact_person" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "emergency_phone" TEXT,
    "is_emergency_contact" BOOLEAN NOT NULL DEFAULT false,
    "street" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "website" TEXT,
    "customer_number" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_documents" (
    "contact_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_documents_pkey" PRIMARY KEY ("contact_id","document_id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'EXTERNAL',
    "category" "IntegrationCategory" NOT NULL DEFAULT 'OTHER',
    "adapter" TEXT NOT NULL,
    "company_id" UUID,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "secret_ref" TEXT,
    "sync_cron" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_id" UUID NOT NULL,
    "direction" "SyncDirection" NOT NULL DEFAULT 'INBOUND',
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "records_read" INTEGER NOT NULL DEFAULT 0,
    "records_created" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_id" UUID NOT NULL,
    "entity_type" "ExternalEntityType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "company_id" UUID,
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "external_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_entity_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_id" UUID NOT NULL,
    "external_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "internal_type" TEXT NOT NULL,
    "internal_id" UUID NOT NULL,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_nfc_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "content_item_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_nfc_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID,
    "comment_id" UUID,
    "reporter_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "company_id" UUID,
    "client_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "ApiClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 120,
    "ip_allowlist" TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "api_client_id" UUID NOT NULL,
    "event_types" TEXT[],
    "target_url" TEXT NOT NULL,
    "secret_ref" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "ActorType" NOT NULL DEFAULT 'USER',
    "actor_id" UUID,
    "company_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "request_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_short_name_key" ON "companies"("short_name");

-- CreateIndex
CREATE UNIQUE INDEX "company_brandings_custom_domain_key" ON "company_brandings"("custom_domain");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "credential_resets_token_hash_key" ON "credential_resets"("token_hash");

-- CreateIndex
CREATE INDEX "credential_resets_user_id_idx" ON "credential_resets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_factors_credential_id_key" ON "mfa_factors"("credential_id");

-- CreateIndex
CREATE INDEX "mfa_factors_user_id_idx" ON "mfa_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_user_id_key" ON "employee_profiles"("user_id");

-- CreateIndex
CREATE INDEX "employee_profiles_company_id_idx" ON "employee_profiles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_company_id_personnel_number_key" ON "employee_profiles"("company_id", "personnel_number");

-- CreateIndex
CREATE INDEX "employee_company_assignments_company_id_valid_to_idx" ON "employee_company_assignments"("company_id", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "employee_company_assignments_employee_profile_id_company_id_key" ON "employee_company_assignments"("employee_profile_id", "company_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "groups_company_id_name_key" ON "groups"("company_id", "name");

-- CreateIndex
CREATE INDEX "user_groups_group_id_idx" ON "user_groups"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "content_items_type_status_published_at_idx" ON "content_items"("type", "status", "published_at");

-- CreateIndex
CREATE INDEX "content_items_company_id_idx" ON "content_items"("company_id");

-- CreateIndex
CREATE INDEX "content_items_author_id_idx" ON "content_items"("author_id");

-- CreateIndex
CREATE INDEX "content_audiences_content_item_id_idx" ON "content_audiences"("content_item_id");

-- CreateIndex
CREATE INDEX "content_audiences_group_id_idx" ON "content_audiences"("group_id");

-- CreateIndex
CREATE INDEX "content_recipients_user_id_idx" ON "content_recipients"("user_id");

-- CreateIndex
CREATE INDEX "resource_acl_content_item_id_idx" ON "resource_acl"("content_item_id");

-- CreateIndex
CREATE INDEX "resource_acl_knowledge_category_id_idx" ON "resource_acl"("knowledge_category_id");

-- CreateIndex
CREATE INDEX "resource_acl_document_category_id_idx" ON "resource_acl"("document_category_id");

-- CreateIndex
CREATE INDEX "resource_acl_contact_category_id_idx" ON "resource_acl"("contact_category_id");

-- CreateIndex
CREATE INDEX "resource_acl_group_id_idx" ON "resource_acl"("group_id");

-- CreateIndex
CREATE INDEX "resource_acl_user_id_idx" ON "resource_acl"("user_id");

-- CreateIndex
CREATE INDEX "read_receipts_user_id_idx" ON "read_receipts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "read_receipts_content_item_id_user_id_key" ON "read_receipts"("content_item_id", "user_id");

-- CreateIndex
CREATE INDEX "reminders_recipient_id_status_idx" ON "reminders"("recipient_id", "status");

-- CreateIndex
CREATE INDEX "reminders_status_scheduled_at_idx" ON "reminders"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_content_item_id_recipient_id_sequence_no_channel_key" ON "reminders"("content_item_id", "recipient_id", "sequence_no", "channel");

-- CreateIndex
CREATE INDEX "comments_content_item_id_created_at_idx" ON "comments"("content_item_id", "created_at");

-- CreateIndex
CREATE INDEX "reactions_content_item_id_idx" ON "reactions"("content_item_id");

-- CreateIndex
CREATE INDEX "reactions_comment_id_idx" ON "reactions"("comment_id");

-- CreateIndex
CREATE INDEX "mentions_mentioned_user_id_idx" ON "mentions"("mentioned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storage_key_key" ON "file_objects"("storage_key");

-- CreateIndex
CREATE INDEX "file_objects_scan_status_idx" ON "file_objects"("scan_status");

-- CreateIndex
CREATE INDEX "attachments_content_item_id_idx" ON "attachments"("content_item_id");

-- CreateIndex
CREATE INDEX "attachments_comment_id_idx" ON "attachments"("comment_id");

-- CreateIndex
CREATE INDEX "attachments_chat_message_id_idx" ON "attachments"("chat_message_id");

-- CreateIndex
CREATE INDEX "content_translations_entity_type_entity_id_idx" ON "content_translations"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_translations_entity_type_entity_id_field_target_loc_key" ON "content_translations"("entity_type", "entity_id", "field", "target_locale", "is_plain_language", "source_hash");

-- CreateIndex
CREATE INDEX "posts_kind_social_category_idx" ON "posts"("kind", "social_category");

-- CreateIndex
CREATE INDEX "handovers_group_id_shift_date_idx" ON "handovers"("group_id", "shift_date");

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_direct_key_key" ON "chat_conversations"("direct_key");

-- CreateIndex
CREATE INDEX "chat_participants_user_id_idx" ON "chat_participants"("user_id");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_id_dedupe_key_key" ON "notifications"("recipient_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_event_type_channel_key" ON "notification_preferences"("user_id", "event_type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_categories_parent_id_slug_key" ON "knowledge_categories"("parent_id", "slug");

-- CreateIndex
CREATE INDEX "knowledge_articles_article_type_idx" ON "knowledge_articles"("article_type");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_category_id_slug_key" ON "knowledge_articles"("category_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_versions_article_id_version_number_key" ON "knowledge_versions"("article_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_parent_id_name_key" ON "document_categories"("parent_id", "name");

-- CreateIndex
CREATE INDEX "documents_category_id_idx" ON "documents"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "search_chunks_content_item_id_version_number_chunk_index_lo_key" ON "search_chunks"("content_item_id", "version_number", "chunk_index", "locale");

-- CreateIndex
CREATE INDEX "tasks_status_due_at_idx" ON "tasks"("status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_lifecycle_instance_id_idx" ON "tasks"("lifecycle_instance_id");

-- CreateIndex
CREATE INDEX "task_assignees_user_id_idx" ON "task_assignees"("user_id");

-- CreateIndex
CREATE INDEX "task_assignees_task_id_idx" ON "task_assignees"("task_id");

-- CreateIndex
CREATE INDEX "checklists_kind_is_active_idx" ON "checklists"("kind", "is_active");

-- CreateIndex
CREATE INDEX "checklists_next_run_at_idx" ON "checklists"("next_run_at");

-- CreateIndex
CREATE INDEX "checklist_items_checklist_id_sort_order_idx" ON "checklist_items"("checklist_id", "sort_order");

-- CreateIndex
CREATE INDEX "checklist_runs_checklist_id_due_at_idx" ON "checklist_runs"("checklist_id", "due_at");

-- CreateIndex
CREATE INDEX "checklist_runs_status_due_at_idx" ON "checklist_runs"("status", "due_at");

-- CreateIndex
CREATE INDEX "checklist_run_items_run_id_sort_order_idx" ON "checklist_run_items"("run_id", "sort_order");

-- CreateIndex
CREATE INDEX "lifecycle_template_steps_template_id_sort_order_idx" ON "lifecycle_template_steps"("template_id", "sort_order");

-- CreateIndex
CREATE INDEX "lifecycle_instances_employee_profile_id_idx" ON "lifecycle_instances"("employee_profile_id");

-- CreateIndex
CREATE INDEX "survey_questions_survey_id_sort_order_idx" ON "survey_questions"("survey_id", "sort_order");

-- CreateIndex
CREATE INDEX "survey_responses_survey_id_idx" ON "survey_responses"("survey_id");

-- CreateIndex
CREATE INDEX "survey_answers_question_id_option_id_idx" ON "survey_answers"("question_id", "option_id");

-- CreateIndex
CREATE INDEX "ideas_status_idx" ON "ideas"("status");

-- CreateIndex
CREATE INDEX "idea_status_history_idea_id_created_at_idx" ON "idea_status_history"("idea_id", "created_at");

-- CreateIndex
CREATE INDEX "absences_employee_profile_id_starts_on_ends_on_idx" ON "absences"("employee_profile_id", "starts_on", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_widget_policies_widget_key_role_id_key" ON "dashboard_widget_policies"("widget_key", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_preferences_user_id_widget_key_key" ON "dashboard_preferences"("user_id", "widget_key");

-- CreateIndex
CREATE UNIQUE INDEX "contact_categories_parent_id_name_key" ON "contact_categories"("parent_id", "name");

-- CreateIndex
CREATE INDEX "contacts_organization_name_idx" ON "contacts"("organization_name");

-- CreateIndex
CREATE INDEX "contacts_is_emergency_contact_idx" ON "contacts"("is_emergency_contact");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_key_key" ON "integrations"("key");

-- CreateIndex
CREATE INDEX "integration_sync_logs_integration_id_started_at_idx" ON "integration_sync_logs"("integration_id", "started_at");

-- CreateIndex
CREATE INDEX "external_entities_entity_type_valid_from_idx" ON "external_entities"("entity_type", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "external_entities_integration_id_entity_type_external_id_key" ON "external_entities"("integration_id", "entity_type", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_entity_mappings_integration_id_external_type_exter_key" ON "external_entity_mappings"("integration_id", "external_type", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_entity_mappings_integration_id_internal_type_inter_key" ON "external_entity_mappings"("integration_id", "internal_type", "internal_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_nfc_links_slug_key" ON "qr_nfc_links"("slug");

-- CreateIndex
CREATE INDEX "content_reports_status_created_at_idx" ON "content_reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_client_id_key" ON "api_clients"("client_id");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_api_client_id_idx" ON "webhook_subscriptions"("api_client_id");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_occurred_at_idx" ON "audit_logs"("actor_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_brandings" ADD CONSTRAINT "company_brandings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_brandings" ADD CONSTRAINT "company_brandings_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_brandings" ADD CONSTRAINT "company_brandings_logo_inverse_file_id_fkey" FOREIGN KEY ("logo_inverse_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_brandings" ADD CONSTRAINT "company_brandings_favicon_file_id_fkey" FOREIGN KEY ("favicon_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_resets" ADD CONSTRAINT "credential_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_resets" ADD CONSTRAINT "credential_resets_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_line_manager_id_fkey" FOREIGN KEY ("line_manager_id") REFERENCES "employee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_company_assignments" ADD CONSTRAINT "employee_company_assignments_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_company_assignments" ADD CONSTRAINT "employee_company_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_parent_group_id_fkey" FOREIGN KEY ("parent_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audiences" ADD CONSTRAINT "content_audiences_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audiences" ADD CONSTRAINT "content_audiences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audiences" ADD CONSTRAINT "content_audiences_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audiences" ADD CONSTRAINT "content_audiences_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audiences" ADD CONSTRAINT "content_audiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_recipients" ADD CONSTRAINT "content_recipients_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_recipients" ADD CONSTRAINT "content_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_knowledge_category_id_fkey" FOREIGN KEY ("knowledge_category_id") REFERENCES "knowledge_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_document_category_id_fkey" FOREIGN KEY ("document_category_id") REFERENCES "document_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_contact_category_id_fkey" FOREIGN KEY ("contact_category_id") REFERENCES "contact_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_acl" ADD CONSTRAINT "resource_acl_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_receipts" ADD CONSTRAINT "read_receipts_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_receipts" ADD CONSTRAINT "read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_embedded_survey_id_fkey" FOREIGN KEY ("embedded_survey_id") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "knowledge_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "knowledge_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_parent_article_id_fkey" FOREIGN KEY ("parent_article_id") REFERENCES "knowledge_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "document_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lifecycle_instance_id_fkey" FOREIGN KEY ("lifecycle_instance_id") REFERENCES "lifecycle_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lifecycle_template_step_id_fkey" FOREIGN KEY ("lifecycle_template_step_id") REFERENCES "lifecycle_template_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_knowledge_article_id_fkey" FOREIGN KEY ("knowledge_article_id") REFERENCES "knowledge_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_assigned_group_id_fkey" FOREIGN KEY ("assigned_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_lifecycle_instance_id_fkey" FOREIGN KEY ("lifecycle_instance_id") REFERENCES "lifecycle_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_run_items" ADD CONSTRAINT "checklist_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "checklist_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_run_items" ADD CONSTRAINT "checklist_run_items_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_run_items" ADD CONSTRAINT "checklist_run_items_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_run_items" ADD CONSTRAINT "checklist_run_items_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_templates" ADD CONSTRAINT "lifecycle_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_template_steps" ADD CONSTRAINT "lifecycle_template_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "lifecycle_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_template_steps" ADD CONSTRAINT "lifecycle_template_steps_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_template_steps" ADD CONSTRAINT "lifecycle_template_steps_responsible_group_id_fkey" FOREIGN KEY ("responsible_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_template_steps" ADD CONSTRAINT "lifecycle_template_steps_responsible_role_id_fkey" FOREIGN KEY ("responsible_role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_template_steps" ADD CONSTRAINT "lifecycle_template_steps_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_template_steps" ADD CONSTRAINT "lifecycle_template_steps_linked_content_id_fkey" FOREIGN KEY ("linked_content_id") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_instances" ADD CONSTRAINT "lifecycle_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "lifecycle_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_instances" ADD CONSTRAINT "lifecycle_instances_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_instances" ADD CONSTRAINT "lifecycle_instances_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_options" ADD CONSTRAINT "survey_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_participations" ADD CONSTRAINT "survey_participations_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_participations" ADD CONSTRAINT "survey_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "survey_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "survey_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_categories" ADD CONSTRAINT "idea_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_id_fkey" FOREIGN KEY ("id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "idea_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_status_history" ADD CONSTRAINT "idea_status_history_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_status_history" ADD CONSTRAINT "idea_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widget_policies" ADD CONSTRAINT "dashboard_widget_policies_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_categories" ADD CONSTRAINT "contact_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "contact_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "contact_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_documents" ADD CONSTRAINT "contact_documents_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_documents" ADD CONSTRAINT "contact_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_entities" ADD CONSTRAINT "external_entities_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_entities" ADD CONSTRAINT "external_entities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_entity_mappings" ADD CONSTRAINT "external_entity_mappings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_nfc_links" ADD CONSTRAINT "qr_nfc_links_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "api_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
