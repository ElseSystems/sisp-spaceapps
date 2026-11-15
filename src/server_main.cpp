#include "monitor/http_server.hpp"

#include <cstdlib>
#include <exception>
#include <filesystem>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
    int port = 8080;
    if (argc > 1) {
        try { port = std::stoi(argv[1]); }
        catch (...) { std::cerr << "Porta inválida.\n"; return 2; }
    }

    try {
        std::filesystem::create_directories("runtime");
        SqliteStore store("runtime/monitoramento.db");
        std::string error;
        int imported_rows = 0;
        const std::string csv_path = "dados/nasa_osdr/OSD-569/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv";
        if (!store.importNasaCbcCsv(csv_path, error, imported_rows)) {
            std::cerr << "Falha ao importar dados NASA: " << error << '\n';
            return 1;
        }
        std::cout << "Dados NASA OSD-569 importados: " << imported_rows << " amostras.\n";
        int feature_rows = 0;
        if (!store.importNasaExpressionCsv("OSD-13",
            "dados/nasa_osdr/OSD-13/GLDS-13_array_normalized_expression_probeset_GLmicroarray.csv",
            "dados/nasa_osdr/OSD-13/GLDS-13_array_SampleTable_GLmicroarray.csv", "", error, feature_rows)) {
            std::cerr << "Falha ao importar OSD-13: " << error << '\n';
            return 1;
        }
        std::cout << "Dados NASA OSD-13 importados: " << feature_rows << " features.\n";
        if (!store.importNasaExpressionCsv("OSD-323",
            "dados/nasa_osdr/OSD-323/GLDS-323_rna_seq_Normalized_Counts_GLbulkRNAseq.csv",
            "dados/nasa_osdr/OSD-323/GLDS-323_rna_seq_SampleTable_GLbulkRNAseq.csv",
            "dados/nasa_osdr/OSD-323/GLDS-323_rna_seq_differential_expression_GLbulkRNAseq.csv",
            error, feature_rows)) {
            std::cerr << "Falha ao importar OSD-323: " << error << '\n';
            return 1;
        }
        std::cout << "Dados NASA OSD-323 importados: " << feature_rows << " features.\n";
        HttpServer server(store, port);
        return server.run();
    } catch (const std::exception& error) {
        std::cerr << "Falha ao iniciar backend: " << error.what() << '\n';
        return 1;
    }
}
