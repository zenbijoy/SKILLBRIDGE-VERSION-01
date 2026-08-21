# RPC Security Matrix

This document lists the security policies for all PostgreSQL RPC functions created to enforce atomic data changes.

## Backend-Only Privileged Functions
These functions perform sensitive administrative actions and must ONLY be executed by the trusted Node.js backend using the `service_role` key. 

*EXECUTE privileges are explicitly revoked from `PUBLIC`, `anon`, and `authenticated`.*

| Function Name | Arguments | Security Definer | Caller |
|---------------|-----------|------------------|--------|
| `block_user_atomic` | `p_blocker_id uuid`, `p_blocked_id uuid` | Yes | Backend (`service_role`) |
| `submit_review_atomic` | `p_reviewer_id uuid`, `p_reviewee_id uuid`, `p_session_id uuid`, `p_rating int`, `p_comment text` | Yes | Backend (`service_role`) |
| `create_room_atomic` | `p_title text`, `p_description text`, `p_topic text`, `p_visibility text`, `p_mode text`, `p_capacity int`, `p_rules text`, `p_tags text[]`, `p_campus_location text`, `p_owner_id uuid` | Yes | Backend (`service_role`) |
| `accept_teaching_request` | `p_room_id uuid`, `p_request_id uuid` | Yes | Backend (`service_role`) |

## Client-Callable Functions
These functions represent complex transactions initiated by users directly from the client. The acting user identity is derived securely using `auth.uid()` inside the function.

| Function Name | Arguments | Security Definer | Caller | Acting Identity |
|---------------|-----------|------------------|--------|-----------------|
| `join_room_atomic` | `p_room_id uuid` | Yes | Authenticated Client | `auth.uid()` |
| `leave_room_atomic` | `p_room_id uuid` | Yes | Authenticated Client | `auth.uid()` |

## Security Definer Rules
All functions marked as `SECURITY DEFINER` follow these strict safety rules:
1. They use `SET search_path = public` to prevent search path hijacking.
2. They do NOT trust client-provided UUIDs for the acting user if callable by the client. Client functions must extract `auth.uid()`.
3. They use row-level locks (e.g., `FOR UPDATE`) to prevent race conditions during state transitions.
