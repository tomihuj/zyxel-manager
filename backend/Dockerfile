FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

FROM base AS dev
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# source mounted as volume in dev

FROM base AS prod
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
