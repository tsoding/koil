#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

typedef struct {
    void **items;
    size_t size;
    size_t capacity;
} DynamicArray;

void da_init(DynamicArray *da) {
    da->items = NULL;
    da->size = 0;
    da->capacity = 0;
}

void da_append(DynamicArray *da, void *item) {
    if (da->size >= da->capacity) {
        size_t new_capacity = da->capacity == 0 ? 1 : da->capacity * 2;
        void **new_items = realloc(da->items, new_capacity * sizeof(*da->items));
        if (!new_items) {
            perror("da_append: realloc failed");
            exit(1);
        }
        da->items = new_items;
        da->capacity = new_capacity;
    }
    da->items[da->size++] = item;
}

typedef struct {
    const char *method;
    const char *path;
} Request;

typedef struct {
    int fd;
    DynamicArray connections;
} KoilServer;

int koil_server_parse_request(const char *buffer, Request *req) {
    char method[16];
    char path[256];
    
    if (sscanf(buffer, "%15s %255s", method, path) != 2) {
        return -1;
    }

    req->method = strdup(method);
    req->path = strdup(path);
    return 0;
}

int koil_server_init(KoilServer *server, int port) {
    server->fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server->fd < 0) {
        perror("socket");
        return -1;
    }

    // Tsoding-style: no SO_REUSEADDR to keep it simple
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons(port),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };

    if (bind(server->fd, (struct sockaddr*)&addr, sizeof(addr)) {
        perror("bind");
        close(server->fd);
        return -1;
    }

    if (listen(server->fd, 5)) {
        perror("listen");
        close(server->fd);
        return -1;
    }

    da_init(&server->connections);
    return 0;
}

void koil_server_free(KoilServer *server) {
    for (size_t i = 0; i < server->connections.size; ++i) {
        close((int)(intptr_t)server->connections.items[i]);
    }
    free(server->connections.items);
    close(server->fd);
}

void koil_server_handle_connection(int client_fd) {
    char buffer[4096];
    ssize_t bytes_read = recv(client_fd, buffer, sizeof(buffer), 0);
    
    if (bytes_read <= 0) {
        close(client_fd);
        return;
    }

    Request req = {0};
    if (koil_server_parse_request(buffer, &req) == 0) {
        const char *response = 
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/plain\r\n"
            "Connection: close\r\n"
            "\r\n"
            "Hello from Koil!";
        send(client_fd, response, strlen(response), 0);
        free((void*)req.method);
        free((void*)req.path);
    } else {
        const char *response = "HTTP/1.1 400 Bad Request\r\n\r\n";
        send(client_fd, response, strlen(response), 0);
    }
    close(client_fd);
}

void koil_server_run(KoilServer *server) {
    for (;;) {
        int client_fd = accept(server->fd, NULL, NULL);
        if (client_fd < 0) {
            perror("accept");
            continue;
        }

        da_append(&server->connections, (void*)(intptr_t)client_fd);
        koil_server_handle_connection(client_fd);
    }
}

int main(void) {
    KoilServer server = {0};
    if (koil_server_init(&server, 8080) != 0) {
        return 1;
    }

    koil_server_run(&server);
    koil_server_free(&server);
    return 0;
}
