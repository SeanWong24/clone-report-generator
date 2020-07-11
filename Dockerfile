FROM ubuntu

RUN apt update && apt install -y make gcc tar curl git unzip

ADD txl10.8.linux64.tar.gz txl/
WORKDIR txl/txl10.8.linux64
RUN ./InstallTxl 

WORKDIR /
RUN rm -r txl

RUN curl -fsSL https://deno.land/x/install/install.sh | sh

COPY . app/
WORKDIR app

ENTRYPOINT ["/root/.deno/bin/deno", "run", "--unstable", "-A"]