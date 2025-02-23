#include <stdbool.h>
#include "cws.h"
#define NOB_STRIP_PREFIX
#include "nob.h"
#undef rename                   // stupid prefix bug in nob.h
#include "teenysha1.h"
#include "b64.h"

typedef struct {
    unsigned char *items;
    size_t count;
    size_t capacity;
} Cws_Payload_Buffer;

typedef enum {
    CWS_OPCODE_CONT  = 0x0,
    CWS_OPCODE_TEXT  = 0x1,
    CWS_OPCODE_BIN   = 0x2,
    CWS_OPCODE_CLOSE = 0x8,
    CWS_OPCODE_PING  = 0x9,
    CWS_OPCODE_PONG  = 0xA,
} Cws_Opcode;

static_assert((int)CWS_OPCODE_TEXT == (int)CWS_MESSAGE_TEXT, "Discrepancy between Cws_Opcode and Cws_Message_Kind");
static_assert((int)CWS_OPCODE_BIN == (int)CWS_MESSAGE_BIN, "Discrepancy between Cws_Opcode and Cws_Message_Kind");

typedef struct {
    bool fin, rsv1, rsv2, rsv3;
    Cws_Opcode opcode;
    bool masked;
    size_t payload_len;
    uint8_t mask[4];
} Cws_Frame_Header;

// TODO: Make the CHUNK_SIZE customizable somehow
// Maybe make it a runtime parameter of Cws, like the client flag.
#define CHUNK_SIZE 1024

#define CWS_FIN(header)         (((header)[0] >> 7)&0x1);
#define CWS_RSV1(header)        (((header)[0] >> 6)&0x1);
#define CWS_RSV2(header)        (((header)[0] >> 5)&0x1);
#define CWS_RSV3(header)        (((header)[0] >> 4)&0x1);
#define CWS_OPCODE(header)      ((header)[0] & 0xF);
#define CWS_MASK(header)        ((header)[1] >> 7);
#define CWS_PAYLOAD_LEN(header) ((header)[1] & 0x7F);

// `cws__` with double underscore means that the function is private
static int cws__socket_read_entire_buffer_raw(Cws_Socket socket, void *buffer, size_t len);
static int cws__socket_write_entire_buffer_raw(Cws_Socket socket, const void *buffer, size_t len);
static int cws__parse_sec_websocket_key_from_request(String_View *request, String_View *sec_websocket_key);
static int cws__parse_sec_websocket_accept_from_response(String_View *response, String_View *sec_websocket_accept);
static const char *cws__compute_sec_websocket_accept(Cws *cws, String_View sec_websocket_key);
static int32_t cws__utf8_to_char32_fixed(unsigned char* ptr, size_t* size);
static void cws__extend_unfinished_utf8(Cws *cws, Cws_Payload_Buffer *payload, size_t pos);
static int cws__read_frame_header(Cws *cws, Cws_Frame_Header *frame_header);
static int cws__read_frame_payload_chunk(Cws *cws, Cws_Frame_Header frame_header, unsigned char *payload, size_t payload_capacity, size_t payload_size);
static int cws__read_frame_entire_payload(Cws *cws, Cws_Frame_Header frame_header, unsigned char **payload, size_t *payload_len);
static int cws__send_frame(Cws *cws, bool fin, Cws_Opcode opcode, unsigned char *payload, size_t payload_len);
static const char *cws__opcode_name(Cws *cws, Cws_Opcode opcode);
static bool cws__opcode_is_control(Cws_Opcode opcode);

void cws_close(Cws *cws)
{
    // Ignoring any errors of socket operations because we are closing the connection anyway

    // TODO: The sender may give a reason of the close via the status code
    // See RFC6466, Section 7.4
    cws__send_frame(cws, true, CWS_OPCODE_CLOSE, NULL, 0);

    // Base on the ideas from https://blog.netherlabs.nl/articles/2009/01/18/the-ultimate-so_linger-page-or-why-is-my-tcp-not-reliable
    // Informing the OS that we are not planning to send anything anymore
    cws->socket.shutdown(cws->socket.data, CWS_SHUTDOWN_WRITE);
    // Depleting input before closing socket, so the OS does not send RST just because we have some input pending on close
    unsigned char buffer[1024];
    while (true) {
        int n = cws->socket.read(cws->socket.data, buffer, sizeof(buffer));
        if (n < 0) break;
    }

    // TODO: consider depleting the send buffer on Linux with ioctl(fd, SIOCOUTQ, &outstanding)
    // See https://blog.netherlabs.nl/articles/2009/01/18/the-ultimate-so_linger-page-or-why-is-my-tcp-not-reliable
    // for more info

    // Actually destroying the socket
    cws->socket.close(cws->socket.data);
    arena_free(&cws->arena);
}

static int cws__socket_read_entire_buffer_raw(Cws_Socket socket, void *buffer, size_t len) {
    char *buf = buffer;
    while (len > 0) {
        int n = socket.read(socket.data, buf, len);
        if (n < 0) return n;
        buf += n;
        len -= n;
    }
    return 0;
}

static int cws__socket_write_entire_buffer_raw(Cws_Socket socket, const void *buffer, size_t len) {
    const char *buf = buffer;
    while (len > 0) {
        int n = socket.write(socket.data, buf, len);
        if (n < 0)  return n;
        buf += n;
        len -= n;
    }
    return 0;
}

int cws_server_handshake(Cws *cws)
{
    // TODO: cws_server_handshake assumes that request fits into 1024 bytes
    char buffer[1024];
    int ret = cws->socket.peek(cws->socket.data, buffer, ARRAY_LEN(buffer));
    if (ret < 0) return ret;
    size_t buffer_size = ret;
    String_View request = nob_sv_from_parts(buffer, buffer_size);

    String_View sec_websocket_key = {0};
    ret = cws__parse_sec_websocket_key_from_request(&request, &sec_websocket_key);
    if (ret < 0) return ret;

    ret = cws__socket_read_entire_buffer_raw(cws->socket, buffer, buffer_size - request.count);
    if (ret < 0) return ret;

    const char *sec_websocket_accept = cws__compute_sec_websocket_accept(cws, sec_websocket_key);

    char *response = arena_sprintf(&cws->arena,
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n"
        "\r\n", sec_websocket_accept);

    ret = cws__socket_write_entire_buffer_raw(cws->socket, response, strlen(response));
    if (ret < 0) return ret;
    return 0;
}

// https://datatracker.ietf.org/doc/html/rfc6455#section-1.3
// TODO: Ws.client_handshake should just accept a ws/wss URL
int cws_client_handshake(Cws *cws, const char *host, const char *endpoint)
{
    const char *handshake = arena_sprintf(&cws->arena,
        // TODO: customizable resource path
        "GET %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        // TODO: Custom WebSocket key
        // Maybe even hardcode something that identifies cws?
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n", endpoint, host);

    int ret = cws__socket_write_entire_buffer_raw(cws->socket, handshake, strlen(handshake));
    if (ret < 0) return ret;

    // TODO: Ws.client_handshake assumes that response fits into 1024 bytes
    char buffer[1024];
    ret = cws->socket.peek(cws->socket.data, buffer, ARRAY_LEN(buffer));
    if (ret < 0) return ret;
    size_t buffer_size = ret;
    String_View response = sv_from_parts(buffer, buffer_size);
    String_View sec_websocket_accept = {0};
    ret = cws__parse_sec_websocket_accept_from_response(&response, &sec_websocket_accept);
    if (ret < 0) return ret;
    ret = cws->socket.read(cws->socket.data, buffer, buffer_size - response.count);
    if (ret < 0) return ret;
    if (!sv_eq(sec_websocket_accept, sv_from_cstr("s3pPLMBiTxaQ9kYGzzhZRbK+xOo="))) return CWS_ERROR_CLIENT_HANDSHAKE_BAD_ACCEPT;
    return 0;
}

static int cws__parse_sec_websocket_accept_from_response(String_View *response, String_View *sec_websocket_accept)
{
    bool found_sec_websocket_accept = false;

    // TODO: verify the response status line
    //   If the status code is an error one, log the message
    sv_chop_by_delim(response, '\n');

    // TODO: verify the rest of the headers of the response
    // Right now we are only looking for Sec-WebSocket-Accept
    while (response->count > 0) {
        String_View header = sv_trim_left(sv_chop_by_delim(response, '\n'));
        if (header.count == 0) break;

        String_View key = sv_trim(sv_chop_by_delim(&header, ':'));
        String_View value = sv_trim(header);

        if (sv_eq(key, sv_from_cstr("Sec-WebSocket-Accept"))) {
            if (found_sec_websocket_accept) return CWS_ERROR_CLIENT_HANDSHAKE_DUPLICATE_ACCEPT;
            *sec_websocket_accept = value;
            found_sec_websocket_accept = true;
        }
    }
    if (!found_sec_websocket_accept) return CWS_ERROR_CLIENT_HANDSHAKE_NO_ACCEPT;
    return 0;
}

static int cws__send_frame(Cws *cws, bool fin, Cws_Opcode opcode, unsigned char *payload, size_t payload_len)
{
    int ret;

    if (cws->debug) {
        printf("CWS DEBUG: TX FRAME: FIN(%d), OPCODE(%s), RSV(000), PAYLOAD_LEN: %zu\n",
               fin,
               cws__opcode_name(cws, opcode),
               payload_len);
    }

    // Send FIN and OPCODE
    {
        // NOTE: FIN is always set
        unsigned char data = (unsigned char) opcode;
        if (fin) data |= (1 << 7);
        ret = cws__socket_write_entire_buffer_raw(cws->socket, &data, 1);
        if (ret < 0) return ret;
    }

    // Send masked and payload length
    {
        // TODO: do we need to reverse the bytes on a machine with a different endianess than x86?
        // NOTE: client frames are always masked
        if (payload_len < 126) {
            unsigned char data = cws->client ? (1 << 7) : 0;
            data |= (unsigned char) payload_len;
            ret = cws__socket_write_entire_buffer_raw(cws->socket, &data, 1);
            if (ret < 0) return ret;
        } else if (payload_len <= UINT16_MAX) {
            unsigned char data = cws->client ? (1 << 7) : 0;
            data |= 126;
            ret = cws__socket_write_entire_buffer_raw(cws->socket, &data, 1);
            if (ret < 0) return ret;

            unsigned char len[2] = {
                (unsigned char)(payload_len >> (8 * 1)) & 0xFF,
                (unsigned char)(payload_len >> (8 * 0)) & 0xFF
            };

            ret = cws__socket_write_entire_buffer_raw(cws->socket, len, ARRAY_LEN(len));
            if (ret < 0) return ret;
        } else if (payload_len > UINT16_MAX) {
            unsigned char data = cws->client ? (1 << 7) : 0;
            data |= 127;
            unsigned char len[8] = {
                (unsigned char) (payload_len >> (8 * 7)) & 0xFF,
                (unsigned char) (payload_len >> (8 * 6)) & 0xFF,
                (unsigned char) (payload_len >> (8 * 5)) & 0xFF,
                (unsigned char) (payload_len >> (8 * 4)) & 0xFF,
                (unsigned char) (payload_len >> (8 * 3)) & 0xFF,
                (unsigned char) (payload_len >> (8 * 2)) & 0xFF,
                (unsigned char) (payload_len >> (8 * 1)) & 0xFF,
                (unsigned char) (payload_len >> (8 * 0)) & 0xFF
            };

            ret = cws__socket_write_entire_buffer_raw(cws->socket, &data, 1);
            if (ret < 0) return ret;
            ret = cws__socket_write_entire_buffer_raw(cws->socket, len, ARRAY_LEN(len));
            if (ret < 0) return ret;
        }
    }

    if (cws->client) {
        unsigned char mask[4] = {0};

        // Generate and send mask
        {
            for (size_t i = 0; i < ARRAY_LEN(mask); ++i) {
                mask[i] = (unsigned char)(rand() % 0x100);
            }
            ret = cws__socket_write_entire_buffer_raw(cws->socket, mask, ARRAY_LEN(mask));
            if (ret < 0) return ret;
        }

        // Mask the payload and send it
        for (size_t i = 0; i < payload_len; ) {
            unsigned char chunk[1024];
            size_t chunk_size = 0;
            while (i < payload_len && chunk_size < ARRAY_LEN(chunk)) {
                chunk[chunk_size] = payload[i] ^ mask[i % 4];
                chunk_size += 1;
                i += 1;
            }
            ret = cws__socket_write_entire_buffer_raw(cws->socket, chunk, chunk_size);
            if (ret < 0) return ret;
        }
    } else {
        ret = cws__socket_write_entire_buffer_raw(cws->socket, payload, payload_len);
        if (ret < 0) return ret;
    }

    return 0;
}

int cws_send_message(Cws *cws, Cws_Message_Kind kind, unsigned char *payload, size_t payload_len)
{
    bool first = true;
    do {
        uint len = payload_len;
        if (len > CHUNK_SIZE) len = CHUNK_SIZE;
        bool fin = payload_len - len == 0;
        Cws_Opcode opcode = first ? (Cws_Opcode) kind : CWS_OPCODE_CONT;

        int ret = cws__send_frame(cws, fin, opcode, payload, len);
        if (ret < 0) return ret;

        payload += len;
        payload_len -= len;
        first = false;
    } while(payload_len > 0);

    return 0;
}

const char *cws_message_kind_name(Cws *cws, Cws_Message_Kind kind)
{
    return cws__opcode_name(cws, (Cws_Opcode) kind);
}

static const char *cws__opcode_name(Cws *cws, Cws_Opcode opcode)
{
    switch (opcode) {
    case CWS_OPCODE_CONT:  return "CONT";
    case CWS_OPCODE_TEXT:  return "TEXT";
    case CWS_OPCODE_BIN:   return "BIN";
    case CWS_OPCODE_CLOSE: return "CLOSE";
    case CWS_OPCODE_PING:  return "PING";
    case CWS_OPCODE_PONG:  return "PONG";
    default:
        if (0x3 <= opcode && opcode <= 0x7) {
            return arena_sprintf(&cws->arena, "NONCONTROL(0x%X)", opcode & 0xF);
        } else if (0xB <= opcode && opcode <= 0xF) {
            return arena_sprintf(&cws->arena, "CONTROL(0x%X)", opcode & 0xF);
        } else {
            return arena_sprintf(&cws->arena, "INVALID(0x%X)", opcode & 0xF);
        }
    }
}

static bool cws__opcode_is_control(Cws_Opcode opcode)
{
    // TODO: cws__opcode_name uses range 0xB <= opcode && opcode <= 0xF. Is this a bug?
    // 0xB and 0x8 kind do look the similar. I need to check the specs on that
    return 0x8 <= opcode && opcode <= 0xF;
}


static int cws__read_frame_header(Cws *cws, Cws_Frame_Header *frame_header)
{
    unsigned char header[2];

    // Read the header
    int ret = cws__socket_read_entire_buffer_raw(cws->socket, header, ARRAY_LEN(header));
    if (ret < 0) return ret;
    frame_header->fin = (bool) CWS_FIN(header);
    frame_header->rsv1 = (bool) CWS_RSV1(header);
    frame_header->rsv2 = (bool) CWS_RSV2(header);
    frame_header->rsv3 = (bool) CWS_RSV3(header);
    frame_header->opcode = (Cws_Opcode) CWS_OPCODE(header);
    frame_header->masked = (bool) CWS_MASK(header);

    // Parse the payload length
    {
        // TODO: do we need to reverse the bytes on a machine with a different endianess than x86?
        unsigned char len = CWS_PAYLOAD_LEN(header);
        switch (len) {
        case 126: {
            unsigned char ext_len[2] = {0};
            ret = cws__socket_read_entire_buffer_raw(cws->socket, ext_len, ARRAY_LEN(ext_len));
            if (ret < 0) return ret;

            for (size_t i = 0; i < ARRAY_LEN(ext_len); ++i) {
                frame_header->payload_len = (frame_header->payload_len << 8) | ext_len[i];
            }
        } break;
        case 127: {
            unsigned char ext_len[8] = {0};
            ret = cws__socket_read_entire_buffer_raw(cws->socket, ext_len, ARRAY_LEN(ext_len));
            if (ret < 0) return ret;

            for (size_t i = 0; i < ARRAY_LEN(ext_len); ++i) {
                frame_header->payload_len = (frame_header->payload_len << 8) | ext_len[i];
            }
        } break;
        default:
            frame_header->payload_len = len;
        }
    }

    if (cws->debug) {
        printf("CWS DEBUG: RX FRAME: FIN(%d), OPCODE(%s), MASKED(%d), RSV(%d%d%d), PAYLOAD_LEN: %zu\n",
               frame_header->fin,
               cws__opcode_name(cws, frame_header->opcode),
               frame_header->masked,
               frame_header->rsv1, frame_header->rsv2, frame_header->rsv3,
               frame_header->payload_len);
    }

    // RFC 6455 - Section 5.5:
    // > All control frames MUST have a payload length of 125 bytes or less
    // > and MUST NOT be fragmented.
    if (cws__opcode_is_control(frame_header->opcode) && (frame_header->payload_len > 125 || !frame_header->fin)) {
        return CWS_ERROR_FRAME_CONTROL_TOO_BIG;
    }

    // RFC 6455 - Section 5.2:
    // >  RSV1, RSV2, RSV3:  1 bit each
    // >
    // >     MUST be 0 unless an extension is negotiated that defines meanings
    // >     for non-zero values.  If a nonzero value is received and none of
    // >     the negotiated extensions defines the meaning of such a nonzero
    // >     value, the receiving endpoint MUST _Fail the WebSocket
    // >     Connection_.
    if (frame_header->rsv1 || frame_header->rsv2 || frame_header->rsv3) {
        return CWS_ERROR_FRAME_RESERVED_BITS_NOT_NEGOTIATED;
    }

    // Read the mask if masked
    if (frame_header->masked) {
        ret = cws__socket_read_entire_buffer_raw(cws->socket, frame_header->mask, ARRAY_LEN(frame_header->mask));
        if (ret < 0) return ret;
    }

    return 0;
}

int cws__read_frame_payload_chunk(Cws *cws, Cws_Frame_Header frame_header, unsigned char *payload, size_t payload_len, size_t finished_payload_len)
{
    assert(frame_header.payload_len == payload_len);
    if (finished_payload_len >= payload_len) return 0;
    unsigned char *unfinished_payload = payload + finished_payload_len;
    size_t unfinished_payload_len = payload_len - finished_payload_len;
    int ret = cws->socket.read(cws->socket.data, unfinished_payload, unfinished_payload_len);
    if (ret < 0) return ret;
    size_t n = ret;
    if (frame_header.masked) {
        for (size_t i = 0; i < unfinished_payload_len; ++i) {
            unfinished_payload[i] ^= frame_header.mask[(finished_payload_len + i) % 4];
        }
    }
    return n;
}

static int cws__read_frame_entire_payload(Cws *cws, Cws_Frame_Header frame_header, unsigned char **payload, size_t *payload_len)
{
    *payload_len = frame_header.payload_len;
    *payload = arena_alloc(&cws->arena, *payload_len);
    size_t finished_payload_len = 0;
    while (finished_payload_len < *payload_len) {
        int ret = cws__read_frame_payload_chunk(cws, frame_header, *payload, *payload_len, finished_payload_len);
        if (ret < 0) return ret;
        size_t n = ret;
        finished_payload_len += n;
    }
    return 0;
}

int cws_read_message(Cws *cws, Cws_Message *message)
{
    Cws_Payload_Buffer payload = {0};
    bool cont = false;
    size_t verify_pos = 0;

    for (;;) {
        Cws_Frame_Header frame = {0};
        int ret =  cws__read_frame_header(cws, &frame);
        if (ret < 0) return ret;
        if (cws__opcode_is_control(frame.opcode)) {
            unsigned char *payload;
            size_t payload_len;
            switch (frame.opcode) {
            case CWS_OPCODE_CLOSE:
                return CWS_ERROR_FRAME_CLOSE_SENT;
            case CWS_OPCODE_PING:
                ret = cws__read_frame_entire_payload(cws, frame, &payload, &payload_len);
                if (ret < 0) return ret;
                ret = cws__send_frame(cws, true, CWS_OPCODE_PONG, payload, payload_len);
                if (ret < 0) return ret;
                break;
            case CWS_OPCODE_PONG:
                ret = cws__read_frame_entire_payload(cws, frame, &payload, &payload_len);
                if (ret < 0) return ret;
                // Unsolicited PONGs are just ignored
                break;
            default:
                return CWS_ERROR_FRAME_UNEXPECTED_OPCODE;
            }
        } else {
            if (!cont) {
                switch (frame.opcode) {
                case CWS_OPCODE_TEXT:
                case CWS_OPCODE_BIN:
                    message->kind = (Cws_Message_Kind) frame.opcode;
                    break;
                default:
                    return CWS_ERROR_FRAME_UNEXPECTED_OPCODE;
                }
                cont = true;
            } else {
                if (frame.opcode != CWS_OPCODE_CONT) {
                    return CWS_ERROR_FRAME_UNEXPECTED_OPCODE;
                }
            }
            size_t frame_payload_len = frame.payload_len;
            unsigned char* frame_payload = arena_alloc(&cws->arena, frame_payload_len);
            size_t frame_finished_payload_len = 0;
            while (frame_finished_payload_len < frame_payload_len) {
                int ret = cws__read_frame_payload_chunk(cws, frame, frame_payload, frame_payload_len, frame_finished_payload_len);
                if (ret < 0) return ret;
                size_t n = ret;
                arena_sb_append_buf(&cws->arena, &payload, frame_payload + frame_finished_payload_len, n);
                frame_finished_payload_len += n;

                if (message->kind == CWS_MESSAGE_TEXT) {
                    // Verifying UTF-8
                    while (verify_pos < payload.count) {
                        size_t size = payload.count - verify_pos;
                        ret = cws__utf8_to_char32_fixed(&payload.items[verify_pos], &size);
                        if (ret < 0) {
                            if (ret != CWS_ERROR_UTF8_SHORT) return ret; // Fail-fast on invalid UTF-8 that is not unfinished UTF-8
                            if (frame.fin)             return ret; // Not tolerating unfinished UTF-8 if the message is finished
                            // Extending the finished UTF-8 to check if it fixes the problem
                            size_t saved_len = payload.count;
                            cws__extend_unfinished_utf8(cws, &payload, verify_pos);
                            size = payload.count - verify_pos;
                            ret = cws__utf8_to_char32_fixed(&payload.items[verify_pos], &size);
                            if (ret < 0) return ret;
                            payload.count = saved_len;
                            break; // Tolerating the unfinished UTF-8 sequences if the message is unfinished
                        }
                        verify_pos += size;
                    }
                }
            }
            if (frame.fin) break;
        }
    }

    message->payload = payload.items;
    message->payload_len = payload.count;

    return 0;
}

static int32_t cws__utf8_to_char32_fixed(unsigned char* ptr, size_t* size)
{
    size_t max_size = *size;
    if (max_size < 1) return CWS_ERROR_UTF8_SHORT;
    unsigned char c = (ptr++)[0];

    if ((c & 0x80) == 0)
    {
        *size = 1;
        return c;
    }
    if ((c & 0xE0) == 0xC0)
    {
        if (max_size < 2) return CWS_ERROR_UTF8_SHORT;
        *size = 2;
        uint32_t uc = (c & 0x1F) << 6;
        c = *ptr;
        // Overlong sequence or invalid second.
        if (!uc || (c & 0xC0) != 0x80) return CWS_ERROR_UTF8_INVALID;
        uc = uc + (c & 0x3F);
        // maximum overlong sequence
        if (uc <= 0x7F) return CWS_ERROR_UTF8_INVALID;
        // UTF-16 surrogate pairs
        if (0xD800 <= uc && uc <= 0xDFFF) return CWS_ERROR_UTF8_INVALID;
        return uc;
    }
    if ((c & 0xF0) == 0xE0)
    {
        if (max_size < 3) return CWS_ERROR_UTF8_SHORT;
        *size = 3;
        uint32_t uc = (c & 0x0F) << 12;
        c = ptr++[0];
        if ((c & 0xC0) != 0x80) return CWS_ERROR_UTF8_INVALID;
        uc += (c & 0x3F) << 6;
        c = ptr++[0];
        // Overlong sequence or invalid last
        if (!uc || (c & 0xC0) != 0x80) return CWS_ERROR_UTF8_INVALID;
        uc = uc + (c & 0x3F);
        // maximum overlong sequence
        if (uc <= 0x7FF) return CWS_ERROR_UTF8_INVALID;
        // UTF-16 surrogate pairs
        if (0xD800 <= uc && uc <= 0xDFFF) return CWS_ERROR_UTF8_INVALID;
        return uc;
    }
    if (max_size < 4) return CWS_ERROR_UTF8_SHORT;
    if ((c & 0xF8) != 0xF0) return CWS_ERROR_UTF8_INVALID;
    *size = 4;
    uint32_t uc = (c & 0x07) << 18;
    c = ptr++[0];
    if ((c & 0xC0) != 0x80) return CWS_ERROR_UTF8_INVALID;
    uc += (c & 0x3F) << 12;
    c = ptr++[0];
    if ((c & 0xC0) != 0x80) return CWS_ERROR_UTF8_INVALID;
    uc += (c & 0x3F) << 6;
    c = ptr++[0];
    // Overlong sequence or invalid last
    if (!uc || (c & 0xC0) != 0x80) return CWS_ERROR_UTF8_INVALID;
    uc = uc + (c & 0x3F);
    // UTF-16 surrogate pairs
    if (0xD800 <= uc && uc <= 0xDFFF) return CWS_ERROR_UTF8_INVALID;
    // maximum overlong sequence
    if (uc <= 0xFFFF) return CWS_ERROR_UTF8_INVALID;
    // Maximum valid Unicode number
    if (uc > 0x10FFFF) return CWS_ERROR_UTF8_INVALID;
    return uc;
}

static void cws__extend_unfinished_utf8(Cws *cws, Cws_Payload_Buffer *payload, size_t pos)
{
    unsigned char c = payload->items[pos];
    size_t size = 0;
    if ((c & 0x80) == 0) {
        size = 1;
    } else if ((c & 0xE0) == 0xC0) {
        size = 2;
    } else if ((c & 0xF0) == 0xE0) {
        size = 3;
    } else {
        size = 4;
    }
    while (payload->count - pos < size) arena_da_append(&cws->arena, payload, 0x80);
}

static int cws__parse_sec_websocket_key_from_request(String_View *request, String_View *sec_websocket_key)
{
    bool found_sec_websocket_key = false;

    // TODO: verify the request status line
    sv_chop_by_delim(request, '\n');

    // TODO: verify the rest of the headers of the request
    // Right now we are only looking for Sec-WebSocket-Key
    while (request->count > 0) {
        String_View header = sv_trim_left(sv_chop_by_delim(request, '\n'));
        if (header.count == 0) break;

        String_View key = sv_trim(sv_chop_by_delim(&header, ':'));
        String_View value = sv_trim(header);

        if (sv_eq(key, sv_from_cstr("Sec-WebSocket-Key"))) {
            if (found_sec_websocket_key) return CWS_ERROR_SERVER_HANDSHAKE_DUPLICATE_KEY;
            *sec_websocket_key = value;
            found_sec_websocket_key = true;
        }
    }
    if (!found_sec_websocket_key) return CWS_ERROR_SERVER_HANDSHAKE_NO_KEY;
    return 0;
}

static const char *cws__compute_sec_websocket_accept(Cws *cws, String_View sec_websocket_key)
{
    const char *src = arena_sprintf(&cws->arena, SV_Fmt"258EAFA5-E914-47DA-95CA-C5AB0DC85B11", SV_Arg(sec_websocket_key));
    SHA1 sha1 = {0};
    sha1_reset(&sha1);
    sha1_process_bytes(&sha1, src, strlen(src));
    digest8_t digest;
    sha1_get_digest_bytes(&sha1, digest);
    size_t sec_websocket_accept_len = b64_encode_out_len(sizeof(digest)) + 1;
    char *sec_websocket_accept = arena_alloc(&cws->arena, sec_websocket_accept_len);
    b64_encode((void*)digest, sizeof(digest), sec_websocket_accept, sec_websocket_accept_len, B64_STD_ALPHA, B64_DEFAULT_PAD);
    sec_websocket_accept[sec_websocket_accept_len-1] = '\0';
    return sec_websocket_accept;
}

const char *cws_error_message(Cws *cws, Cws_Error error)
{
    switch (error) {
        case CWS_OK:                                       return "OK";
        case CWS_ERROR_ERRNO:                              return strerror(errno);
        case CWS_ERROR_CONNECTION_CLOSED:                  return "Connection closed";
        case CWS_ERROR_FRAME_CONTROL_TOO_BIG:              return "Control frame too big";
        case CWS_ERROR_FRAME_RESERVED_BITS_NOT_NEGOTIATED: return "Unnegotiated reserved frame bits";
        case CWS_ERROR_FRAME_CLOSE_SENT:                   return "Close frame was sent";
        case CWS_ERROR_FRAME_UNEXPECTED_OPCODE:            return "Unexpected opcode frame";
        case CWS_ERROR_UTF8_SHORT:                         return "UTF-8 sequence is too short";
        case CWS_ERROR_UTF8_INVALID:                       return "UTF-8 sequence is invalid";
        case CWS_ERROR_SERVER_HANDSHAKE_DUPLICATE_KEY:     return "Server Handshake: duplicate Sec-WebSocket-Key";
        case CWS_ERROR_SERVER_HANDSHAKE_NO_KEY:            return "Server Handshake: Sec-WebSocket-Key is missing";
        case CWS_ERROR_CLIENT_HANDSHAKE_BAD_ACCEPT:        return "Client Handshake: bad Sec-WebSocket-Accept";
        case CWS_ERROR_CLIENT_HANDSHAKE_DUPLICATE_ACCEPT:  return "Client Handshake: duplicate Sec-WebSocket-Accept";
        case CWS_ERROR_CLIENT_HANDSHAKE_NO_ACCEPT:         return "Client Handshake: no Sec-WebSocket-Accept";
        default: if (error <= CWS_ERROR_CUSTOM) {
            return arena_sprintf(&cws->arena, "Custom error (%d)", error);
        } else if (CWS_ERROR_CUSTOM < error && error < CWS_OK) {
            return arena_sprintf(&cws->arena, "Unknown error (%d)", error);
        } else {
            return arena_sprintf(&cws->arena, "Not an error (%d)", error);
        }
    }
}

#define ARENA_IMPLEMENTATION
#include "arena.h"
#define NOB_IMPLEMENTATION
#include "nob.h"
#define TEENY_SHA1_IMPLEMENTATION
#include "teenysha1.h"
#define B64_IMPLEMENTATION
#include "b64.h"
