# Dockerfile
FROM python:3.11-slim

# Install dependencies (ffmpeg needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create config and logs directories with permissions
RUN mkdir -p /config/logs && chmod -R 777 /config

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY utils.py .
COPY templates/ ./templates/
COPY static/ ./static/

# Copy default profiles to a temporary location inside image
COPY profiles/ /app/default_profiles/

# Copy and set up entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 5000

ENV FLASK_APP=app/__init__.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=5000

ENTRYPOINT ["/app/entrypoint.sh"]
# Explicitly set host for flask run command
CMD ["flask", "run", "--host=0.0.0.0"]
