# Image ORCA PRIBADI. ORCA berlisensi (akademik gratis) dan TIDAK boleh didistribusikan ulang;
# unduh sendiri dari https://orcaforum.kofo.mpg.de lalu letakkan arsip di folder ini.
#
#   docker build -t orca-local:6.0.1 \
#     --build-arg ORCA_TAR=orca_6_0_1_linux_x86-64_shared_openmpi416.tar.xz .
#
# Pada Mac Apple Silicon image x86-64 berjalan lewat emulasi (lambat): set DOCKER_PLATFORM=linux/amd64.
FROM ubuntu:22.04
ARG ORCA_TAR
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends bash xz-utils openmpi-bin libopenmpi-dev libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY ${ORCA_TAR} /tmp/orca.tar.xz
RUN mkdir -p /opt/orca && tar -xJf /tmp/orca.tar.xz -C /opt/orca --strip-components=1 && rm /tmp/orca.tar.xz
ENV PATH=/opt/orca:$PATH LD_LIBRARY_PATH=/opt/orca:$LD_LIBRARY_PATH
WORKDIR /work
