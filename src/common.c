#include "common.h"

void* allocate_temporary_buffer(size_t size);

bool batch_message_verify_empty(MessageKind kind, Message *message) {
    // If message is empty it's byte_length must be equal to the size of BatchMessage exactly
    if (message->byte_length != sizeof(BatchMessage)) return false;
    BatchMessage* batch_message = (BatchMessage*)message;
    if ((MessageKind)batch_message->kind != kind) return false;
    return true;
}

bool batch_message_verify(MessageKind kind, Message *message, size_t payload_size) {
    if (message->byte_length < sizeof(BatchMessage)) return false;
    if ((message->byte_length - sizeof(BatchMessage))%payload_size != 0) return false;
    BatchMessage* batch_message = (BatchMessage*)message;
    if ((MessageKind)batch_message->kind != kind) return false;
    return true;
}

BatchMessage *batch_message_alloc(MessageKind kind, size_t count, size_t payload_size) {
    size_t byte_length = sizeof(BatchMessage) + payload_size*count;
    BatchMessage *message = allocate_temporary_buffer(byte_length);
    message->byte_length = byte_length;
    message->kind = kind;
    return message;
}
