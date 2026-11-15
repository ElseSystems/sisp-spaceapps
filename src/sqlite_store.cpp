#include "monitor/sqlite_store.hpp"

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <unordered_map>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace {

const char* sourceName(std::uint8_t source) {
    switch (source) {
        case READING_SOURCE_NASA_OSDR: return "NASA_OSDR";
        case READING_SOURCE_JAXA_DARTS: return "JAXA_DARTS";
        case READING_SOURCE_SMARTWATCH: return "SMARTWATCH";
        case READING_SOURCE_SIMULATED:
        default: return "SIMULATED";
    }
}

bool execute(sqlite3* db, const char* sql, std::string& error) {
    char* message = nullptr;
    if (sqlite3_exec(db, sql, nullptr, nullptr, &message) != SQLITE_OK) {
        error = message != nullptr ? message : sqlite3_errmsg(db);
        sqlite3_free(message);
        return false;
    }
    return true;
}

std::string jsonEscape(const std::string& value) {
    std::ostringstream out;
    for (const unsigned char ch : value) {
        switch (ch) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (ch < 0x20u) {
                    out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(ch) << std::dec;
                } else {
                    out << static_cast<char>(ch);
                }
        }
    }
    return out.str();
}

std::vector<std::string> parseCsvLine(const std::string& line) {
    std::vector<std::string> fields;
    std::string field;
    bool quoted = false;
    for (size_t i = 0; i < line.size(); ++i) {
        const char ch = line[i];
        if (ch == '"') {
            if (quoted && i + 1u < line.size() && line[i + 1u] == '"') {
                field.push_back('"');
                ++i;
            } else {
                quoted = !quoted;
            }
        } else if (ch == ',' && !quoted) {
            fields.push_back(field);
            field.clear();
        } else if (ch != '\r') {
            field.push_back(ch);
        }
    }
    fields.push_back(field);
    return fields;
}

bool parseSample(const std::string& sample, std::string& subject, std::string& phase, int& day) {
    const size_t first_separator = sample.find('_');
    if (first_separator == std::string::npos) return false;
    subject = sample.substr(0, first_separator);
    size_t marker = sample.find("_L-");
    bool recovery = false;
    if (marker == std::string::npos) {
        marker = sample.find("_R+");
        recovery = true;
    }
    if (marker == std::string::npos) return false;
    const size_t number_start = marker + 3u;
    const size_t number_end = sample.find('_', number_start);
    const std::string digits = sample.substr(number_start, number_end - number_start);
    if (digits.empty()) return false;
    try {
        const int value = std::stoi(digits);
        day = recovery ? value : -value;
        phase = sample.substr(marker + 1u, number_end - marker - 1u);
        return true;
    } catch (...) {
        return false;
    }
}

} // namespace

SqliteStore::SqliteStore(const std::string& path) {
    const int result = sqlite3_open(path.c_str(), &db_);
    if (result != SQLITE_OK) {
        const std::string message = db_ != nullptr ? sqlite3_errmsg(db_) : "SQLite could not open the database";
        if (db_ != nullptr) {
            sqlite3_close(db_);
            db_ = nullptr;
        }
        throw std::runtime_error(message);
    }

    std::string error;
    if (!initialize(error)) {
        sqlite3_close(db_);
        db_ = nullptr;
        throw std::runtime_error(error);
    }
}

SqliteStore::~SqliteStore() {
    if (db_ != nullptr) {
        sqlite3_close(db_);
    }
}

bool SqliteStore::initialize(std::string& error) {
    constexpr const char* schema =
        "PRAGMA journal_mode=WAL;"
        "PRAGMA synchronous=NORMAL;"
        "CREATE TABLE IF NOT EXISTS readings ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT,"
        " timestamp_ms INTEGER NOT NULL,"
        " mission_elapsed_s INTEGER NOT NULL,"
        " source TEXT NOT NULL,"
        " valid_fields INTEGER NOT NULL,"
        " heart_rate_bpm INTEGER,"
        " spo2_percent INTEGER,"
        " body_temperature_c REAL"
        ");"
        "CREATE TABLE IF NOT EXISTS nasa_cbc ("
        " sample_name TEXT NOT NULL, subject_id TEXT NOT NULL, phase TEXT NOT NULL,"
        " day_offset INTEGER NOT NULL, marker TEXT NOT NULL, unit TEXT NOT NULL,"
        " value REAL NOT NULL, reference_min REAL, reference_max REAL,"
        " PRIMARY KEY(sample_name, marker)"
        ");"
        "CREATE INDEX IF NOT EXISTS idx_nasa_cbc_series ON nasa_cbc(subject_id, marker, day_offset);"
        "CREATE TABLE IF NOT EXISTS nasa_expression_samples ("
        " study_id TEXT NOT NULL, sample_id TEXT NOT NULL, condition TEXT NOT NULL,"
        " PRIMARY KEY(study_id, sample_id)"
        ");"
        "CREATE TABLE IF NOT EXISTS nasa_expression ("
        " study_id TEXT NOT NULL, feature_id TEXT NOT NULL, symbol TEXT NOT NULL, feature_name TEXT NOT NULL,"
        " sample_id TEXT NOT NULL, condition TEXT NOT NULL, value REAL NOT NULL,"
        " PRIMARY KEY(study_id, feature_id, sample_id)"
        ");"
        "CREATE INDEX IF NOT EXISTS idx_nasa_expression_gene ON nasa_expression(study_id, symbol, sample_id);";
    sqlite3_busy_timeout(db_, 3000);
    return execute(db_, schema, error);
}

bool SqliteStore::saveReading(const HealthReading& reading, std::string& error) {
    constexpr const char* sql =
        "INSERT INTO readings (timestamp_ms, mission_elapsed_s, source, valid_fields,"
        " heart_rate_bpm, spo2_percent, body_temperature_c)"
        " VALUES (?, ?, ?, ?, ?, ?, ?);";
    sqlite3_stmt* statement = nullptr;

    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) {
        error = sqlite3_errmsg(db_);
        return false;
    }

    sqlite3_bind_int64(statement, 1, static_cast<sqlite3_int64>(reading.timestamp_ms));
    sqlite3_bind_int64(statement, 2, static_cast<sqlite3_int64>(reading.mission_elapsed_s));
    sqlite3_bind_text(statement, 3, sourceName(reading.source), -1, SQLITE_STATIC);
    sqlite3_bind_int(statement, 4, static_cast<int>(reading.valid_fields));

    if ((reading.valid_fields & HEALTH_FIELD_HEART_RATE) != 0u) {
        sqlite3_bind_int(statement, 5, static_cast<int>(reading.heart_rate_bpm));
    } else {
        sqlite3_bind_null(statement, 5);
    }
    if ((reading.valid_fields & HEALTH_FIELD_SPO2) != 0u) {
        sqlite3_bind_int(statement, 6, static_cast<int>(reading.spo2_percent));
    } else {
        sqlite3_bind_null(statement, 6);
    }
    if ((reading.valid_fields & HEALTH_FIELD_BODY_TEMPERATURE) != 0u) {
        sqlite3_bind_double(statement, 7, static_cast<double>(reading.body_temperature_c));
    } else {
        sqlite3_bind_null(statement, 7);
    }

    const int result = sqlite3_step(statement);
    if (result != SQLITE_DONE) {
        error = sqlite3_errmsg(db_);
        sqlite3_finalize(statement);
        return false;
    }
    sqlite3_finalize(statement);
    return true;
}

bool SqliteStore::printRecentReadings(int limit, std::string& error) const {
    constexpr const char* sql =
        "SELECT timestamp_ms, mission_elapsed_s, source, heart_rate_bpm, spo2_percent, body_temperature_c"
        " FROM readings ORDER BY id DESC LIMIT ?;";
    sqlite3_stmt* statement = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) {
        error = sqlite3_errmsg(db_);
        return false;
    }
    sqlite3_bind_int(statement, 1, limit);

    while (sqlite3_step(statement) == SQLITE_ROW) {
        std::cout << "  t=" << sqlite3_column_int64(statement, 1) << " s"
                  << " | origem=" << reinterpret_cast<const char*>(sqlite3_column_text(statement, 2))
                  << " | FC=";
        if (sqlite3_column_type(statement, 3) == SQLITE_NULL) std::cout << "N/D";
        else std::cout << sqlite3_column_int(statement, 3) << " bpm";
        std::cout << " | SpO2=";
        if (sqlite3_column_type(statement, 4) == SQLITE_NULL) std::cout << "N/D";
        else std::cout << sqlite3_column_int(statement, 4) << "%";
        std::cout << " | Temp=";
        if (sqlite3_column_type(statement, 5) == SQLITE_NULL) std::cout << "N/D";
        else std::cout << sqlite3_column_double(statement, 5) << " C";
        std::cout << '\n';
    }

    if (sqlite3_errcode(db_) != SQLITE_OK && sqlite3_errcode(db_) != SQLITE_DONE) {
        error = sqlite3_errmsg(db_);
        sqlite3_finalize(statement);
        return false;
    }
    sqlite3_finalize(statement);
    return true;
}

bool SqliteStore::importNasaCbcCsv(const std::string& path, std::string& error, int& imported_rows) {
    std::ifstream input(path);
    if (!input) {
        error = "Não foi possível abrir o CSV NASA: " + path;
        return false;
    }
    std::string line;
    if (!std::getline(input, line)) {
        error = "O CSV NASA está vazio: " + path;
        return false;
    }
    std::vector<std::string> header = parseCsvLine(line);
    if (!header.empty() && header[0].size() >= 3u &&
        static_cast<unsigned char>(header[0][0]) == 0xEFu &&
        static_cast<unsigned char>(header[0][1]) == 0xBBu &&
        static_cast<unsigned char>(header[0][2]) == 0xBFu) {
        header[0].erase(0, 3);
    }
    if (header.empty() || header[0] != "Sample Name") {
        error = "Cabeçalho não reconhecido no CSV OSDR.";
        return false;
    }

    struct MetricColumns { size_t value; size_t low; size_t high; std::string name; std::string unit; };
    std::vector<MetricColumns> metrics;
    for (size_t i = 1; i < header.size(); ++i) {
        const size_t value_part = header[i].find("_value_");
        if (value_part == std::string::npos) continue;
        std::string low_header = header[i];
        std::string high_header = header[i];
        low_header.replace(value_part, 7u, "_range_min_");
        high_header.replace(value_part, 7u, "_range_max_");
        const auto low_it = std::find(header.begin(), header.end(), low_header);
        const auto high_it = std::find(header.begin(), header.end(), high_header);
        if (low_it == header.end() || high_it == header.end()) continue;
        const std::string marker_name = header[i].substr(0, value_part);
        const std::string unit_name = marker_name == "hemoglobin"
            ? "grams_per_deciliter"
            : header[i].substr(value_part + 7u);
        metrics.push_back({i, static_cast<size_t>(low_it - header.begin()), static_cast<size_t>(high_it - header.begin()),
            marker_name, unit_name});
    }
    if (metrics.empty()) {
        error = "Nenhuma coluna de medida com faixa de referência foi encontrada.";
        return false;
    }

    constexpr const char* sql =
        "INSERT OR REPLACE INTO nasa_cbc"
        " (sample_name, subject_id, phase, day_offset, marker, unit, value, reference_min, reference_max)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
    sqlite3_stmt* statement = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) {
        error = sqlite3_errmsg(db_);
        return false;
    }
    if (!execute(db_, "BEGIN TRANSACTION;", error)) {
        sqlite3_finalize(statement);
        return false;
    }

    imported_rows = 0;
    bool failed = false;
    while (std::getline(input, line)) {
        if (line.empty()) continue;
        const std::vector<std::string> fields = parseCsvLine(line);
        if (fields.size() != header.size()) {
            error = "Número inesperado de colunas na linha " + std::to_string(imported_rows + 2);
            failed = true;
            break;
        }
        std::string subject;
        std::string phase;
        int day = 0;
        if (!parseSample(fields[0], subject, phase, day)) {
            error = "Não foi possível interpretar o código de amostra: " + fields[0];
            failed = true;
            break;
        }
        for (const MetricColumns& metric : metrics) {
            if (fields[metric.value].empty()) continue;
            try {
                const double value = std::stod(fields[metric.value]);
                sqlite3_bind_text(statement, 1, fields[0].c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(statement, 2, subject.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(statement, 3, phase.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_int(statement, 4, day);
                sqlite3_bind_text(statement, 5, metric.name.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(statement, 6, metric.unit.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_double(statement, 7, value);
                if (fields[metric.low].empty()) sqlite3_bind_null(statement, 8);
                else sqlite3_bind_double(statement, 8, std::stod(fields[metric.low]));
                if (fields[metric.high].empty()) sqlite3_bind_null(statement, 9);
                else sqlite3_bind_double(statement, 9, std::stod(fields[metric.high]));
                if (sqlite3_step(statement) != SQLITE_DONE) {
                    error = sqlite3_errmsg(db_);
                    failed = true;
                    break;
                }
                sqlite3_reset(statement);
                sqlite3_clear_bindings(statement);
            } catch (const std::exception& ex) {
                error = "Valor numérico inválido no CSV: " + std::string(ex.what());
                failed = true;
                break;
            }
        }
        if (failed) break;
        ++imported_rows;
    }
    sqlite3_finalize(statement);
    if (failed) {
        std::string ignored;
        execute(db_, "ROLLBACK;", ignored);
        return false;
    }
    return execute(db_, "COMMIT;", error);
}

std::string SqliteStore::nasaCbcSummaryJson() const {
    sqlite3_stmt* statement = nullptr;
    constexpr const char* sql =
        "SELECT COUNT(DISTINCT subject_id), COUNT(DISTINCT sample_name), COUNT(DISTINCT marker),"
        " MIN(day_offset), MAX(day_offset) FROM nasa_cbc;";
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) return "{}";
    if (sqlite3_step(statement) != SQLITE_ROW) { sqlite3_finalize(statement); return "{}"; }
    std::ostringstream out;
    out << "{\"study\":\"OSD-569\",\"mission\":\"Inspiration4\",\"subjects\":" << sqlite3_column_int(statement, 0)
        << ",\"samples\":" << sqlite3_column_int(statement, 1)
        << ",\"markers\":" << sqlite3_column_int(statement, 2)
        << ",\"day_start\":" << sqlite3_column_int(statement, 3)
        << ",\"day_end\":" << sqlite3_column_int(statement, 4) << "}";
    sqlite3_finalize(statement);
    return out.str();
}

std::string SqliteStore::nasaCbcSubjectsJson() const {
    sqlite3_stmt* statement = nullptr;
    if (sqlite3_prepare_v2(db_, "SELECT DISTINCT subject_id FROM nasa_cbc ORDER BY subject_id;", -1, &statement, nullptr) != SQLITE_OK) return "[]";
    std::ostringstream out;
    out << '[';
    bool first = true;
    while (sqlite3_step(statement) == SQLITE_ROW) {
        if (!first) out << ',';
        first = false;
        const auto* value = sqlite3_column_text(statement, 0);
        out << "\"" << jsonEscape(value == nullptr ? "" : reinterpret_cast<const char*>(value)) << "\"";
    }
    out << ']';
    sqlite3_finalize(statement);
    return out.str();
}

std::string SqliteStore::nasaCbcMarkersJson() const {
    sqlite3_stmt* statement = nullptr;
    constexpr const char* sql = "SELECT marker, unit, COUNT(DISTINCT sample_name) FROM nasa_cbc GROUP BY marker, unit ORDER BY marker;";
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) return "[]";
    std::ostringstream out;
    out << '[';
    bool first = true;
    while (sqlite3_step(statement) == SQLITE_ROW) {
        if (!first) out << ',';
        first = false;
        const auto* marker = sqlite3_column_text(statement, 0);
        const auto* unit = sqlite3_column_text(statement, 1);
        out << "{\"id\":\"" << jsonEscape(marker == nullptr ? "" : reinterpret_cast<const char*>(marker))
            << "\",\"unit\":\"" << jsonEscape(unit == nullptr ? "" : reinterpret_cast<const char*>(unit))
            << "\",\"samples\":" << sqlite3_column_int(statement, 2) << '}';
    }
    out << ']';
    sqlite3_finalize(statement);
    return out.str();
}

std::string SqliteStore::nasaCbcSeriesJson(const std::string& subject, const std::string& marker) const {
    sqlite3_stmt* statement = nullptr;
    constexpr const char* sql =
        "SELECT sample_name, phase, day_offset, value, reference_min, reference_max, unit"
        " FROM nasa_cbc WHERE subject_id = ? AND marker = ? ORDER BY day_offset;";
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) return "[]";
    sqlite3_bind_text(statement, 1, subject.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 2, marker.c_str(), -1, SQLITE_TRANSIENT);
    std::ostringstream out;
    out << std::setprecision(10) << '[';
    bool first = true;
    while (sqlite3_step(statement) == SQLITE_ROW) {
        if (!first) out << ',';
        first = false;
        const auto* sample = sqlite3_column_text(statement, 0);
        const auto* phase = sqlite3_column_text(statement, 1);
        const auto* unit = sqlite3_column_text(statement, 6);
        out << "{\"sample\":\"" << jsonEscape(sample == nullptr ? "" : reinterpret_cast<const char*>(sample))
            << "\",\"phase\":\"" << jsonEscape(phase == nullptr ? "" : reinterpret_cast<const char*>(phase))
            << "\",\"day\":" << sqlite3_column_int(statement, 2)
            << ",\"value\":" << sqlite3_column_double(statement, 3) << ",\"reference_min\":";
        if (sqlite3_column_type(statement, 4) == SQLITE_NULL) out << "null"; else out << sqlite3_column_double(statement, 4);
        out << ",\"reference_max\":";
        if (sqlite3_column_type(statement, 5) == SQLITE_NULL) out << "null"; else out << sqlite3_column_double(statement, 5);
        out << ",\"unit\":\"" << jsonEscape(unit == nullptr ? "" : reinterpret_cast<const char*>(unit)) << "\"}";
    }
    out << ']';
    sqlite3_finalize(statement);
    return out.str();
}

bool SqliteStore::importNasaExpressionCsv(const std::string& study, const std::string& matrix_path,
    const std::string& sample_table_path, const std::string& annotation_path,
    std::string& error, int& feature_rows) {
    std::ifstream sample_file(sample_table_path);
    std::ifstream matrix_file(matrix_path);
    if (!sample_file || !matrix_file) {
        error = "Não foi possível abrir a matriz ou a tabela de amostras de " + study;
        return false;
    }

    std::string line;
    if (!std::getline(sample_file, line)) { error = "Tabela de amostras vazia para " + study; return false; }
    const std::vector<std::string> sample_header = parseCsvLine(line);
    std::unordered_map<std::string, std::string> sample_conditions;
    while (std::getline(sample_file, line)) {
        if (line.empty()) continue;
        const auto fields = parseCsvLine(line);
        if (fields.size() >= 2u && !fields[0].empty()) sample_conditions[fields[0]] = fields[1];
    }
    if (sample_conditions.empty()) { error = "Não há identificadores de amostra em " + sample_table_path; return false; }
    (void)sample_header;

    std::unordered_map<std::string, std::pair<std::string, std::string>> annotations;
    if (!annotation_path.empty()) {
        std::ifstream annotation_file(annotation_path);
        if (!annotation_file) { error = "Não foi possível abrir a tabela de anotação: " + annotation_path; return false; }
        if (std::getline(annotation_file, line)) {
            const auto annotation_header = parseCsvLine(line);
            const auto id_it = std::find(annotation_header.begin(), annotation_header.end(), "ENSEMBL");
            const auto symbol_it = std::find(annotation_header.begin(), annotation_header.end(), "SYMBOL");
            const auto name_it = std::find(annotation_header.begin(), annotation_header.end(), "GENENAME");
            if (id_it != annotation_header.end()) {
                const size_t id_index = static_cast<size_t>(id_it - annotation_header.begin());
                const size_t symbol_index = symbol_it == annotation_header.end() ? annotation_header.size() : static_cast<size_t>(symbol_it - annotation_header.begin());
                const size_t name_index = name_it == annotation_header.end() ? annotation_header.size() : static_cast<size_t>(name_it - annotation_header.begin());
                while (std::getline(annotation_file, line)) {
                    if (line.empty()) continue;
                    const auto fields = parseCsvLine(line);
                    if (fields.size() <= id_index || fields[id_index].empty()) continue;
                    const std::string symbol = symbol_index < fields.size() ? fields[symbol_index] : "";
                    const std::string name = name_index < fields.size() ? fields[name_index] : "";
                    annotations.emplace(fields[id_index], std::make_pair(symbol, name));
                }
            }
        }
    }

    if (!std::getline(matrix_file, line)) { error = "Matriz de expressão vazia para " + study; return false; }
    const auto header = parseCsvLine(line);
    size_t feature_index = 0u;
    size_t symbol_index = header.size();
    size_t name_index = header.size();
    const auto id_it = std::find(header.begin(), header.end(), "ENSEMBL");
    if (id_it != header.end()) feature_index = static_cast<size_t>(id_it - header.begin());
    const auto symbol_it = std::find(header.begin(), header.end(), "SYMBOL");
    if (symbol_it != header.end()) symbol_index = static_cast<size_t>(symbol_it - header.begin());
    const auto name_it = std::find(header.begin(), header.end(), "GENENAME");
    if (name_it != header.end()) name_index = static_cast<size_t>(name_it - header.begin());

    std::vector<size_t> sample_columns;
    std::vector<std::string> sample_ids;
    for (size_t column = 0; column < header.size(); ++column) {
        if (sample_conditions.find(header[column]) != sample_conditions.end()) {
            sample_columns.push_back(column);
            sample_ids.push_back(header[column]);
        }
    }
    if (sample_columns.empty()) { error = "Nenhuma coluna da matriz corresponde à tabela de amostras de " + study; return false; }

    constexpr const char* sample_sql = "INSERT OR REPLACE INTO nasa_expression_samples (study_id, sample_id, condition) VALUES (?, ?, ?);";
    constexpr const char* value_sql = "INSERT OR REPLACE INTO nasa_expression (study_id, feature_id, symbol, feature_name, sample_id, condition, value) VALUES (?, ?, ?, ?, ?, ?, ?);";
    sqlite3_stmt* sample_statement = nullptr;
    sqlite3_stmt* value_statement = nullptr;
    if (sqlite3_prepare_v2(db_, sample_sql, -1, &sample_statement, nullptr) != SQLITE_OK ||
        sqlite3_prepare_v2(db_, value_sql, -1, &value_statement, nullptr) != SQLITE_OK) {
        error = sqlite3_errmsg(db_);
        if (sample_statement) sqlite3_finalize(sample_statement);
        if (value_statement) sqlite3_finalize(value_statement);
        return false;
    }
    if (!execute(db_, "BEGIN TRANSACTION;", error)) {
        sqlite3_finalize(sample_statement);
        sqlite3_finalize(value_statement);
        return false;
    }
    sqlite3_stmt* delete_statement = nullptr;
    if (sqlite3_prepare_v2(db_, "DELETE FROM nasa_expression WHERE study_id = ?;", -1, &delete_statement, nullptr) != SQLITE_OK) {
        error = sqlite3_errmsg(db_);
        sqlite3_finalize(sample_statement); sqlite3_finalize(value_statement);
        std::string ignored; execute(db_, "ROLLBACK;", ignored); return false;
    }
    sqlite3_bind_text(delete_statement, 1, study.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_step(delete_statement);
    sqlite3_finalize(delete_statement);
    if (sqlite3_prepare_v2(db_, "DELETE FROM nasa_expression_samples WHERE study_id = ?;", -1, &delete_statement, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(delete_statement, 1, study.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(delete_statement);
        sqlite3_finalize(delete_statement);
    }

    bool failed = false;
    for (const auto& sample : sample_ids) {
        sqlite3_bind_text(sample_statement, 1, study.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(sample_statement, 2, sample.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(sample_statement, 3, sample_conditions[sample].c_str(), -1, SQLITE_TRANSIENT);
        if (sqlite3_step(sample_statement) != SQLITE_DONE) { error = sqlite3_errmsg(db_); failed = true; break; }
        sqlite3_reset(sample_statement); sqlite3_clear_bindings(sample_statement);
    }

    feature_rows = 0;
    while (!failed && std::getline(matrix_file, line)) {
        if (line.empty()) continue;
        const auto fields = parseCsvLine(line);
        if (fields.size() != header.size() || feature_index >= fields.size() || fields[feature_index].empty()) continue;
        const std::string feature_id = fields[feature_index];
        std::string symbol = symbol_index < fields.size() ? fields[symbol_index] : "";
        std::string feature_name = name_index < fields.size() ? fields[name_index] : "";
        if (symbol.empty()) {
            const auto annotation = annotations.find(feature_id);
            if (annotation != annotations.end()) { symbol = annotation->second.first; feature_name = annotation->second.second; }
        }
        if (symbol.empty()) symbol = feature_id;
        for (size_t i = 0; i < sample_columns.size(); ++i) {
            const size_t column = sample_columns[i];
            if (column >= fields.size() || fields[column].empty()) continue;
            try {
                const double value = std::stod(fields[column]);
                const std::string& sample = sample_ids[i];
                sqlite3_bind_text(value_statement, 1, study.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(value_statement, 2, feature_id.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(value_statement, 3, symbol.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(value_statement, 4, feature_name.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(value_statement, 5, sample.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(value_statement, 6, sample_conditions[sample].c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_double(value_statement, 7, value);
                if (sqlite3_step(value_statement) != SQLITE_DONE) { error = sqlite3_errmsg(db_); failed = true; break; }
                sqlite3_reset(value_statement); sqlite3_clear_bindings(value_statement);
            } catch (const std::exception& ex) { error = "Valor de expressão inválido: " + std::string(ex.what()); failed = true; break; }
        }
        if (!failed) ++feature_rows;
    }
    sqlite3_finalize(sample_statement);
    sqlite3_finalize(value_statement);
    if (failed) {
        std::string ignored; execute(db_, "ROLLBACK;", ignored); return false;
    }
    return execute(db_, "COMMIT;", error);
}

std::string SqliteStore::nasaStudiesJson() const {
    return "["
        "{\"id\":\"OSD-569\",\"type\":\"cbc\",\"mission\":\"Inspiration4\",\"title\":\"Inspiration4 — hemograma\",\"subtitle\":\"Sangue total · pré e pós-voo\",\"description\":\"Estudo de hemograma de quatro participantes da missão Inspiration4; coletas em solo antes e depois do voo.\",\"note\":\"Dados humanos históricos. Não há CBC coletado em órbita neste arquivo.\",\"url\":\"https://osdr.nasa.gov/bio/repo/data/studies/OSD-569\"},"
        "{\"id\":\"OSD-13\",\"type\":\"expression\",\"mission\":\"ISS\",\"title\":\"ISS — ativação de células T\",\"subtitle\":\"Microarray · microgravidade e controle 1g\",\"description\":\"Células T humanas ativadas a bordo da ISS comparadas com controle por centrífuga a 1g e células não ativadas.\",\"note\":\"Experimento celular (in vitro), não prontuário nem medida clínica de tripulante.\",\"url\":\"https://osdr.nasa.gov/bio/repo/data/studies/OSD-13\"},"
        "{\"id\":\"OSD-323\",\"type\":\"expression\",\"mission\":\"STS-131\",\"title\":\"STS-131 — STL-IMMUNE\",\"subtitle\":\"RNA-seq · células e resposta a Salmonella\",\"description\":\"Células epiteliais intestinais humanas infectadas/não infectadas por Salmonella, em condições de voo e solo.\",\"note\":\"Modelo celular de interação patógeno-hospedeiro; não houve astronauta infectado neste experimento.\",\"url\":\"https://osdr.nasa.gov/bio/repo/data/studies/OSD-323\"}"
        "]";
}

std::string SqliteStore::nasaStudySummaryJson(const std::string& study) const {
    if (study == "OSD-569") return nasaCbcSummaryJson();
    sqlite3_stmt* statement = nullptr;
    constexpr const char* sql = "SELECT COUNT(DISTINCT sample_id), COUNT(DISTINCT condition), COUNT(DISTINCT feature_id) FROM nasa_expression WHERE study_id = ?;";
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) return "{}";
    sqlite3_bind_text(statement, 1, study.c_str(), -1, SQLITE_TRANSIENT);
    const int step = sqlite3_step(statement);
    if (step != SQLITE_ROW) { sqlite3_finalize(statement); return "{}"; }
    std::ostringstream out;
    out << "{\"study\":\"" << jsonEscape(study) << "\",\"samples\":" << sqlite3_column_int(statement, 0)
        << ",\"conditions\":" << sqlite3_column_int(statement, 1) << ",\"features\":" << sqlite3_column_int(statement, 2) << "}";
    sqlite3_finalize(statement);
    return out.str();
}

std::string SqliteStore::nasaExpressionGenesJson(const std::string& study, const std::string& query) const {
    sqlite3_stmt* statement = nullptr;
    constexpr const char* sql =
        "SELECT symbol, feature_id, feature_name FROM nasa_expression"
        " WHERE study_id = ? AND (? = '' OR symbol LIKE ? OR feature_id LIKE ?)"
        " GROUP BY symbol, feature_id ORDER BY CASE WHEN UPPER(symbol) = UPPER(?) THEN 0 ELSE 1 END, symbol LIMIT 30;";
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) return "[]";
    std::string pattern = "%" + query + "%";
    sqlite3_bind_text(statement, 1, study.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 2, query.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 3, pattern.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 4, pattern.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 5, query.c_str(), -1, SQLITE_TRANSIENT);
    std::ostringstream out;
    out << '[';
    bool first = true;
    while (sqlite3_step(statement) == SQLITE_ROW) {
        if (!first) out << ',';
        first = false;
        const auto* symbol = sqlite3_column_text(statement, 0);
        const auto* id = sqlite3_column_text(statement, 1);
        const auto* name = sqlite3_column_text(statement, 2);
        out << "{\"symbol\":\"" << jsonEscape(symbol == nullptr ? "" : reinterpret_cast<const char*>(symbol))
            << "\",\"id\":\"" << jsonEscape(id == nullptr ? "" : reinterpret_cast<const char*>(id))
            << "\",\"name\":\"" << jsonEscape(name == nullptr ? "" : reinterpret_cast<const char*>(name)) << "\"}";
    }
    out << ']';
    sqlite3_finalize(statement);
    return out.str();
}

std::string SqliteStore::nasaExpressionSeriesJson(const std::string& study, const std::string& gene) const {
    sqlite3_stmt* statement = nullptr;
    constexpr const char* sql =
        "SELECT sample_id, condition, AVG(value), COUNT(DISTINCT feature_id)"
        " FROM nasa_expression WHERE study_id = ? AND UPPER(symbol) = UPPER(?)"
        " GROUP BY sample_id, condition ORDER BY condition, sample_id;";
    if (sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr) != SQLITE_OK) return "[]";
    sqlite3_bind_text(statement, 1, study.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 2, gene.c_str(), -1, SQLITE_TRANSIENT);
    std::ostringstream out;
    out << std::setprecision(10) << '[';
    bool first = true;
    while (sqlite3_step(statement) == SQLITE_ROW) {
        if (!first) out << ',';
        first = false;
        const auto* sample = sqlite3_column_text(statement, 0);
        const auto* condition = sqlite3_column_text(statement, 1);
        out << "{\"sample\":\"" << jsonEscape(sample == nullptr ? "" : reinterpret_cast<const char*>(sample))
            << "\",\"condition\":\"" << jsonEscape(condition == nullptr ? "" : reinterpret_cast<const char*>(condition))
            << "\",\"value\":" << sqlite3_column_double(statement, 2)
            << ",\"features_averaged\":" << sqlite3_column_int(statement, 3) << '}';
    }
    out << ']';
    sqlite3_finalize(statement);
    return out.str();
}
