#pragma once

#include <stddef.h>
#include <stdint.h>

namespace visual_protocol {

constexpr uint8_t MAGIC = 0xE7;
constexpr uint8_t VERSION = 1;
constexpr size_t PACKET_BYTES = 20;
constexpr size_t PAYLOAD_BYTES = 15;

enum Opcode : uint8_t {
  INFO = 0x01,
  HELLO = 0x02,
  LOAD_BEGIN = 0x10,
  LOAD_CHANNEL = 0x11,
  LOAD_SEGMENT = 0x12,
  LOAD_COMMIT = 0x13,
  SYNC = 0x20,
  ARM = 0x21,
  COMMIT = 0x22,
  ADJUST = 0x23,
  HEARTBEAT = 0x24,
  STOP = 0x25,
  TEST = 0x26,
  STATUS_REQUEST = 0x27,
  ACK = 0x80,
  SYNC_REPLY = 0x81,
  STATE = 0x82,
  FAULT_EVENT = 0x83,
  COMPLETE = 0x84,
};

enum State : uint8_t { BOOT, ADVERTISING, CONNECTED, LOADING, READY, ARMED, RUNNING, FAULT_STATE };
enum Status : uint8_t {
  SUCCESS,
  BAD_PACKET,
  BAD_STATE,
  BAD_SEQUENCE,
  BAD_VALUE,
  BAD_SESSION,
  BAD_SCHEDULE,
  TOO_LATE,
  BUSY,
  NOT_AUTHENTICATED,
  INTERNAL_ERROR,
};

inline uint8_t crc8(const uint8_t *bytes, size_t length) {
  uint8_t crc = 0;
  for (size_t index = 0; index < length; ++index) {
    crc ^= bytes[index];
    for (uint8_t bit = 0; bit < 8; ++bit) crc = crc & 0x80 ? static_cast<uint8_t>((crc << 1) ^ 0x07) : static_cast<uint8_t>(crc << 1);
  }
  return crc;
}

inline uint32_t crc32Update(uint32_t crc, const uint8_t *bytes, size_t length) {
  for (size_t index = 0; index < length; ++index) {
    crc ^= bytes[index];
    for (uint8_t bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (crc & 1 ? 0xEDB88320UL : 0);
  }
  return crc;
}

inline bool validPacket(const uint8_t *bytes, size_t length) {
  return length == PACKET_BYTES && bytes[0] == MAGIC && bytes[1] == VERSION && crc8(bytes, PACKET_BYTES - 1) == bytes[PACKET_BYTES - 1];
}

inline uint16_t readU16(const uint8_t *bytes) { return static_cast<uint16_t>(bytes[0] | static_cast<uint16_t>(bytes[1]) << 8); }
inline uint32_t readU32(const uint8_t *bytes) {
  return static_cast<uint32_t>(bytes[0]) | static_cast<uint32_t>(bytes[1]) << 8 | static_cast<uint32_t>(bytes[2]) << 16 | static_cast<uint32_t>(bytes[3]) << 24;
}
inline uint64_t readU64(const uint8_t *bytes) { return static_cast<uint64_t>(readU32(bytes)) | static_cast<uint64_t>(readU32(bytes + 4)) << 32; }

inline void writeU16(uint8_t *bytes, uint16_t value) { bytes[0] = value; bytes[1] = value >> 8; }
inline void writeU32(uint8_t *bytes, uint32_t value) {
  bytes[0] = value; bytes[1] = value >> 8; bytes[2] = value >> 16; bytes[3] = value >> 24;
}
inline void writeU64(uint8_t *bytes, uint64_t value) { writeU32(bytes, value); writeU32(bytes + 4, value >> 32); }

inline void buildPacket(uint8_t *bytes, uint8_t opcode, uint8_t sequence) {
  for (size_t index = 0; index < PACKET_BYTES; ++index) bytes[index] = 0;
  bytes[0] = MAGIC;
  bytes[1] = VERSION;
  bytes[2] = opcode;
  bytes[3] = sequence;
}

inline void finishPacket(uint8_t *bytes) { bytes[PACKET_BYTES - 1] = crc8(bytes, PACKET_BYTES - 1); }

}  // namespace visual_protocol
