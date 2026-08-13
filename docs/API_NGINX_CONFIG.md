# Production Nginx Configuration Guide

Since your domain currently resolves `swapno.duckdns.org` directly to Kong (Supabase API Gateway), you need to set up the SkillBridge Express API (which runs on port 4000) and the Admin UI.

There are two approaches:

## Approach A: Using the Same Domain (Recommended for Staging with DuckDNS)
You can route the custom Express API through a subpath on your existing domain.

1. Open your Nginx configuration for `swapno.duckdns.org` (e.g., `/etc/nginx/sites-available/default` or similar).
2. Add the following location block **before** the root proxy pass:

```nginx
# Route /api to the Custom Express Backend (Port 4000)
location /api/ {
    proxy_pass http://127.0.0.1:4000/; # Note the trailing slash to strip /api
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Serve the Admin Control Plane UI
location /admin/ {
    alias /home/ubuntu/skillbridge_admin/dist/;
    try_files $uri $uri/ /admin/index.html;
}
```

3. Update `frontend/.env` to reflect this routing: `EXPO_PUBLIC_API_URL=https://swapno.duckdns.org/api`

## Approach B: Dedicated API and Admin Domains (Production)
If you register a proper wildcard domain (e.g., `skillbridge.app`), create new Nginx server blocks for `api.skillbridge.app` and `admin.skillbridge.app`.

### API Nginx Block
```nginx
server {
    server_name api.yourdomain.com;
    
    # ... standard SSL directives here ...

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Admin Nginx Block
```nginx
server {
    server_name admin.yourdomain.com;
    
    # ... standard SSL directives here ...

    root /home/ubuntu/skillbridge_admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

After updating Nginx, test and restart:
```bash
sudo nginx -t
sudo systemctl reload nginx
```
