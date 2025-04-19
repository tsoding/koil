FROM ubuntu:latest AS build

RUN apt update && apt install cmake git clang zlib1g zlib1g-dev libllvm18 llvm llvm-dev llvm-runtime liblld-dev liblld-18 libpolly-18-dev -y

# RUN wget https://apt.llvm.org/llvm.sh && \
#     chmod +x llvm.sh && \
#     ./llvm.sh 17 all

RUN git clone https://github.com/c3lang/c3c && \
    cd c3c && \
    git checkout 855be9288121d0f7a67d277f7bbbbf57fbfa2597 && \
    mkdir build && \
    cd build && \
    cmake .. && \
    cmake --build . && \
    chmod +x c3c && \
    cp c3c /usr/local/bin/c3c && \
    cp -r lib /usr/local/bin/lib 


COPY src src

RUN mkdir build && \
    gcc -Wall -Wextra -ggdb -o build/coroutine.o -c src/cws/coroutine.c && \
    gcc -Wall -Wextra -ggdb -o build/cws.o -c src/cws/cws.c && \
    ar -rcs build/libcws.a build/coroutine.o build/cws.o
RUN gcc -Wall -Wextra -ggdb -I src/cws/ -c src/server.c -o build/server.o && \
    c3c compile -l build/libcws.a -o build/server build/server.o src/server.c3 src/common.c3 src/cws/cws.c3 src/cws/coroutine.c3

FROM node:latest AS run

COPY --from=build /lib/x86_64-linux-gnu /lib/x86_64-linux-gnu 
COPY . .

RUN npm i

COPY --from=build build/server build/server

ENTRYPOINT [ "npm", "run", "serve" ]