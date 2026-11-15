#include "monitor/ram_table.h"
#include "monitor/sqlite_store.hpp"

#include <chrono>
#include <exception>
#include <iomanip>
#include <iostream>
#include <string>

namespace {

uint64_t nowMillis() {
    const auto now = std::chrono::system_clock::now().time_since_epoch();
    return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(now).count());
}

} // namespace

int main() {
    static RamTable ram_table;
    ram_table_init(&ram_table);

    HealthReading demo{};
    demo.timestamp_ms = nowMillis();
    demo.mission_elapsed_s = 0;
    demo.heart_rate_bpm = 72;
    demo.spo2_percent = 98;
    demo.body_temperature_c = 36.7F;
    demo.source = READING_SOURCE_SIMULATED;
    demo.valid_fields = HEALTH_FIELD_HEART_RATE | HEALTH_FIELD_SPO2 | HEALTH_FIELD_BODY_TEMPERATURE;

    if (!ram_table_push(&ram_table, &demo)) {
        std::cerr << "Falha ao gravar leitura na tabela RAM.\n";
        return 1;
    }

    HealthReading latest{};
    if (!ram_table_latest(&ram_table, &latest)) {
        std::cerr << "A tabela RAM ainda não contém leituras.\n";
        return 1;
    }

    try {
        SqliteStore store("runtime/monitoramento.db");
        std::string error;
        if (!store.saveReading(latest, error)) {
            std::cerr << "Falha ao salvar no SQLite: " << error << '\n';
            return 1;
        }

        std::cout << "MVP C/C++ inicializado. Leitura de demonstração (sintética)\n"
                  << "Buffer RAM: " << ram_table_count(&ram_table) << '/' << RAM_TABLE_CAPACITY << " registros\n"
                  << "Histórico SQLite: runtime/monitoramento.db\n"
                  << "Registros mais recentes:\n";
        if (!store.printRecentReadings(5, error)) {
            std::cerr << "Falha ao consultar SQLite: " << error << '\n';
            return 1;
        }
    } catch (const std::exception& error) {
        std::cerr << "Falha ao iniciar SQLite: " << error.what() << '\n';
        return 1;
    }

    return 0;
}
