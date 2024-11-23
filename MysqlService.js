const mysql = require('mysql2/promise');

class MySQLService {
    constructor(config) {
        this.config = config;
    }

    async executar(query, params = []) {
        const connection = await mysql.createConnection(this.config);
        try {
            const [results] = await connection.execute(query, params);
            return results;
        } finally {
            await connection.end();
        }
    }

    async executarSemRetorno(query, params = []) {
        const connection = await mysql.createConnection(this.config);
        try {
            await connection.execute(query, params);
        } finally {
            await connection.end();
        }
    }
}

module.exports = MySQLService;
