FROM python:3.12-slim
WORKDIR /srv
# docker CLI dibutuhkan hanya jika adapter local_docker dipakai dari dalam container
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client docker.io && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN useradd -m app && mkdir -p /srv/data && chown app /srv/data
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
