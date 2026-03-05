FROM ubuntu:22.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y     python3 python3-pip python3-venv tzdata &&     rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app
RUN pip3 install --no-cache-dir -r requirements.txt
CMD ["pytest", "-q"]
