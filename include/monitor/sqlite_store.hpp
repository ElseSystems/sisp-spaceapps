#ifndef MONITOR_SQLITE_STORE_HPP
#define MONITOR_SQLITE_STORE_HPP

#include "monitor/health_data.h"

#include <sqlite3.h>
#include <string>

class SqliteStore {
public:
    explicit SqliteStore(const std::string& path);
    ~SqliteStore();

    SqliteStore(const SqliteStore&) = delete;
    SqliteStore& operator=(const SqliteStore&) = delete;

    bool saveReading(const HealthReading& reading, std::string& error);
    bool printRecentReadings(int limit, std::string& error) const;
    bool importNasaCbcCsv(const std::string& path, std::string& error, int& imported_rows);
    std::string nasaCbcSummaryJson() const;
    std::string nasaCbcSubjectsJson() const;
    std::string nasaCbcMarkersJson() const;
    std::string nasaCbcSeriesJson(const std::string& subject, const std::string& marker) const;
    bool importNasaExpressionCsv(const std::string& study, const std::string& matrix_path,
        const std::string& sample_table_path, const std::string& annotation_path,
        std::string& error, int& feature_rows);
    std::string nasaStudiesJson() const;
    std::string nasaStudySummaryJson(const std::string& study) const;
    std::string nasaExpressionGenesJson(const std::string& study, const std::string& query) const;
    std::string nasaExpressionSeriesJson(const std::string& study, const std::string& gene) const;

private:
    sqlite3* db_ = nullptr;
    bool initialize(std::string& error);
};

#endif
