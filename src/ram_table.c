#include "monitor/ram_table.h"

#include <string.h>

void ram_table_init(RamTable *table) {
    if (table == NULL) {
        return;
    }
    memset(table, 0, sizeof(*table));
}

bool ram_table_push(RamTable *table, const HealthReading *reading) {
    if (table == NULL || reading == NULL) {
        return false;
    }

    table->rows[table->next_write] = *reading;
    table->next_write = (table->next_write + 1u) % RAM_TABLE_CAPACITY;
    if (table->count < RAM_TABLE_CAPACITY) {
        table->count++;
    }
    return true;
}

bool ram_table_latest(const RamTable *table, HealthReading *out_reading) {
    size_t latest_index;

    if (table == NULL || out_reading == NULL || table->count == 0u) {
        return false;
    }

    latest_index = (table->next_write == 0u)
        ? RAM_TABLE_CAPACITY - 1u
        : table->next_write - 1u;
    *out_reading = table->rows[latest_index];
    return true;
}

size_t ram_table_count(const RamTable *table) {
    return table == NULL ? 0u : table->count;
}
