FROM nginx:alpine
COPY dist /usr/share/nginx/html

RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n    add_header Cache-Control "no-cache, no-store, must-revalidate";\n  }\n  location /assets/ {\n    try_files $uri =404;\n    add_header Cache-Control "public, max-age=31536000, immutable";\n  }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
