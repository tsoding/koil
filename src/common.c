#include "common.h"

bool batch_message_verify(MessageKind kind, Message *message, size_t payload_size) {
    if (message->byte_length < sizeof(BatchMessage)) return false;
    if ((message->byte_length - sizeof(BatchMessage))%payload_size != 0) return false;
    BatchMessage* batch_message = (BatchMessage*)message;
    if ((MessageKind)batch_message->kind != kind) return false;
    return true;
}
