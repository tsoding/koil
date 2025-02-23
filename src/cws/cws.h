#ifndef CWS_H_
#define CWS_H_

#include <stdlib.h>
#include <stdbool.h>
#include "arena.h"

// TODO: run autobahn testsuit on CI and deploy reports to github pages

typedef enum {
    CWS_SHUTDOWN_READ,
    CWS_SHUTDOWN_WRITE,
    CWS_SHUTDOWN_BOTH,
} Cws_Shutdown_How;

// The errors are returned as negative values from cws_* functions
typedef enum {
    CWS_OK                                       =    0,
    CWS_ERROR_ERRNO                              =   -1,
    CWS_ERROR_CONNECTION_CLOSED                  =   -2,
    CWS_ERROR_FRAME_CONTROL_TOO_BIG              =   -3,
    CWS_ERROR_FRAME_RESERVED_BITS_NOT_NEGOTIATED =   -4,
    CWS_ERROR_FRAME_CLOSE_SENT                   =   -5,
    CWS_ERROR_FRAME_UNEXPECTED_OPCODE            =   -6,
    CWS_ERROR_UTF8_SHORT                         =   -7,
    CWS_ERROR_UTF8_INVALID                       =   -8,
    CWS_ERROR_SERVER_HANDSHAKE_DUPLICATE_KEY     =   -9,
    CWS_ERROR_SERVER_HANDSHAKE_NO_KEY            =  -10,
    CWS_ERROR_CLIENT_HANDSHAKE_BAD_ACCEPT        =  -11,
    CWS_ERROR_CLIENT_HANDSHAKE_DUPLICATE_ACCEPT  =  -12,
    CWS_ERROR_CLIENT_HANDSHAKE_NO_ACCEPT         =  -13,
    CWS_ERROR_CUSTOM                             = -100,
} Cws_Error;

// TODO: Maybe cws should ship some stock implementations of Cws_Socket backends:
// - Plain sync
// - Plain async on coroutines
// - TLS sync
// - TLS async on coroutines (if coroutines even work with OpenSSL)
// Some of them are already implemented in examples

// NOTE: read, write, and peek must never return 0. On internally returning 0 they must return CWS_ERROR_CONNECTION_CLOSED
typedef struct {
    void *data;
    int (*read)(void *data, void *buffer, size_t len);
    // peek: like read, but does not remove data from the buffer
    // Usually implemented via MSG_PEEK flag of recv
    int (*peek)(void *data, void *buffer, size_t len);
    int (*write)(void *data, const void *buffer, size_t len);
    int (*shutdown)(void *data, Cws_Shutdown_How how);
    int (*close)(void *data);
} Cws_Socket;

typedef struct {
    Cws_Socket socket;
    Arena arena;   // All the dynamic memory allocations done by cws go into this arena
    bool debug;    // Enable debug logging
    bool client;
} Cws;

typedef enum {
    CWS_MESSAGE_TEXT = 0x1,
    CWS_MESSAGE_BIN  = 0x2,
} Cws_Message_Kind;

typedef struct {
    Cws_Message_Kind kind;
    unsigned char *payload;
    size_t payload_len;
} Cws_Message;

const char *cws_message_kind_name(Cws *cws, Cws_Message_Kind kind);
const char *cws_error_message(Cws *cws, Cws_Error error);
// TODO: cws_server_handshake should allow you to inspect endpoints requested by clients and reject them
int cws_server_handshake(Cws *cws);
int cws_client_handshake(Cws *cws, const char *host, const char *endpoint);
int cws_send_message(Cws *cws, Cws_Message_Kind kind, unsigned char *payload, size_t payload_len);
int cws_read_message(Cws *cws, Cws_Message *message);
void cws_close(Cws *cws);

#endif // CWS_H_
