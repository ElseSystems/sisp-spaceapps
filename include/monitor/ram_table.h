#ifndef MONITOR_RAM_TABLE_H
#define MONITOR_RAM_TABLE_H

#include <stdbool.h>
#include <stddef.h>
#include "monitor/health_data.h"

#ifdef __cplusplus
extern "C" {
#endif

#define RAM_TABLE_CAPACITY 512u

typedef struct {
    HealthReading rows[RAM_TABLE_CAPACITY];
    size_t next_write;
    size_t count;
} RamTable;

void ram_table_init(RamTable *table);
bool ram_table_push(RamTable *table, const HealthReading *reading);
bool ram_table_latest(const RamTable *table, HealthReading *out_reading);
size_t ram_table_count(const RamTable *table);

#ifdef __cplusplus
}
#endif

#endif
