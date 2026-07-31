# Build desde la raíz del repo:
#   docker build -f docker/Dockerfile -t guiders-backend .
#
# --------------------------
# Stage 1: Build
# --------------------------
  FROM node:18-slim AS builder

  ARG CACHE_BUSTER

  WORKDIR /app
  
  # Copiar package.json y lock
  COPY package*.json ./
  
  # Instalar TODAS las dependencias (incluyendo dev)
  RUN npm install --legacy-peer-deps
  
  # Copiar todo el código fuente
  COPY tsconfig.build.json ./
  COPY . .
  
  # ✅ Compilar incluyendo src/ y tools/
  RUN npm run build
  
  # --------------------------
  # Stage 2: Producción
  # --------------------------
  FROM node:18-slim AS production
  
  WORKDIR /app
  
  # Copiar solo lo necesario del builder
  COPY --from=builder /app/package*.json ./
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/.env.production .env.production
  COPY --from=builder /app/tsconfig.json ./tsconfig.json
  COPY --from=builder /app/tsconfig.build.json ./tsconfig.build.json
  
  # Instalar solo dependencias de producción
  RUN npm install --omit=dev --legacy-peer-deps
  
  # Exponer puerto
  EXPOSE 3000
  
  # Comando de inicio (NestJS)
  CMD ["npm", "run", "start:prod"]
  