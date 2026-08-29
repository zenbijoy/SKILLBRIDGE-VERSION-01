export function getOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "SkillBridge API",
      version: "2.0.0",
      description:
        "SkillBridge Production API — Enterprise peer-to-peer learning, mentorship, real-time communication, and growth platform.",
      contact: {
        name: "SkillBridge Engineering",
        url: "https://skillbridge.example.com",
      },
      license: {
        name: "Proprietary",
      },
    },
    servers: [
      {
        url: "/api/v1",
        description: "API v1 Endpoint",
      },
      {
        url: "/",
        description: "Root Endpoint (Health & Docs)",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter Supabase Auth JWT token in header: Authorization: Bearer <token>",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          required: ["success", "error", "code", "message", "requestId"],
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string", example: "Resource not found" },
            code: {
              type: "string",
              enum: [
                "VALIDATION_ERROR",
                "AUTHENTICATION_REQUIRED",
                "INVALID_CREDENTIALS",
                "FORBIDDEN",
                "RESOURCE_NOT_FOUND",
                "RESOURCE_CONFLICT",
                "RATE_LIMIT_EXCEEDED",
                "DATABASE_ERROR",
                "EXTERNAL_SERVICE_ERROR",
                "INTERNAL_SERVER_ERROR",
              ],
              example: "RESOURCE_NOT_FOUND",
            },
            message: { type: "string", example: "Resource not found" },
            requestId: { type: "string", format: "uuid", example: "c208c903-8d09-4672-881b-df06a1ef8bb4" },
            details: { type: "object", nullable: true },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            status: { type: "string", example: "UP" },
            version: { type: "string", example: "2.0.1" },
            service: { type: "string", example: "skillbridge-api" },
          },
        },
        ReadinessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            status: { type: "string", example: "UP" },
            data: {
              type: "object",
              properties: {
                api: { type: "string", example: "ok" },
                database: { type: "string", example: "enabled" },
                redis: { type: "string", example: "enabled" },
                livekit: { type: "string", example: "enabled" },
                ai: { type: "string", example: "enabled" },
              },
            },
          },
        },
        Profile: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            username: { type: "string" },
            full_name: { type: "string" },
            avatar_url: { type: "string", nullable: true },
            headline: { type: "string", nullable: true },
            bio: { type: "string", nullable: true },
            reputation: { type: "number" },
            points: { type: "number" },
            roles: { type: "array", items: { type: "string" } },
            account_status: { type: "string", enum: ["active", "suspended", "banned", "deactivated"] },
          },
        },
        Room: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string" },
            owner_id: { type: "string", format: "uuid" },
            category: { type: "string" },
            capacity: { type: "integer", minimum: 2, maximum: 250 },
            is_private: { type: "boolean" },
            member_count: { type: "integer" },
          },
        },
        CallOffer: {
          type: "object",
          required: ["callee_id", "call_type"],
          properties: {
            callee_id: { type: "string", format: "uuid" },
            call_type: { type: "string", enum: ["audio", "video"] },
            room_id: { type: "string", format: "uuid", nullable: true },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "Liveness probe",
          tags: ["Health"],
          responses: {
            "200": {
              description: "API process is running and responsive",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
            },
          },
        },
      },
      "/health/ready": {
        get: {
          summary: "Readiness probe",
          tags: ["Health"],
          responses: {
            "200": {
              description: "All core subsystems reachable and operating",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ReadinessResponse" } } },
            },
            "503": {
              description: "One or more critical subsystems unavailable",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ReadinessResponse" } } },
            },
          },
        },
      },
      "/dashboard": {
        get: {
          summary: "Get personalized user dashboard",
          tags: ["Dashboard"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "mode", in: "query", schema: { type: "string", enum: ["learn", "teach"] } },
          ],
          responses: {
            "200": { description: "Dashboard state, widgets, statistics, and active rooms" },
            "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/profiles/me": {
        get: {
          summary: "Get current user profile",
          tags: ["Profiles"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Current user profile" },
            "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/rooms": {
        get: {
          summary: "List or search rooms",
          tags: ["Rooms"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of rooms matching filters" },
          },
        },
        post: {
          summary: "Create a learning room",
          tags: ["Rooms"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Room" } } },
          },
          responses: {
            "201": { description: "Room created successfully" },
            "400": { description: "Validation error" },
          },
        },
      },
      "/calls": {
        post: {
          summary: "Initiate a WebRTC / LiveKit call",
          tags: ["Calls"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CallOffer" } } },
          },
          responses: {
            "201": { description: "Call created and ringing" },
            "409": { description: "Callee busy or active call in progress" },
          },
        },
      },
      "/calls/ice-servers": {
        get: {
          summary: "Fetch safe STUN/TURN ICE server configuration",
          tags: ["Calls"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "ICE server credentials for WebRTC peer connection" },
          },
        },
      },
    },
  };
}

export function renderSwaggerHtml(specUrl = "/openapi.json"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SkillBridge API Reference & Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" />
  <style>
    body { margin: 0; background: #0f172a; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
}
