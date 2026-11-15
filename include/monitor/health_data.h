#ifndef MONITOR_HEALTH_DATA_H
#define MONITOR_HEALTH_DATA_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    READING_SOURCE_SIMULATED = 0,
    READING_SOURCE_NASA_OSDR = 1,
    READING_SOURCE_JAXA_DARTS = 2,
    READING_SOURCE_SMARTWATCH = 3
} ReadingSource;

enum {
    HEALTH_FIELD_HEART_RATE = 1u << 0,
    HEALTH_FIELD_SPO2 = 1u << 1,
    HEALTH_FIELD_BODY_TEMPERATURE = 1u << 2
};

/* Fixed-size record: safe to copy into a statically allocated RAM table. */
typedef struct {
    uint64_t timestamp_ms;
    uint32_t mission_elapsed_s;
    uint16_t heart_rate_bpm;
    uint8_t spo2_percent;
    uint8_t source;
    uint8_t valid_fields;
    float body_temperature_c;
} HealthReading;

#ifdef __cplusplus
}
#endif

#endif
