const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const bcrypt = require('bcrypt');

const encripta = async (senha) => {
    if (!senha) return null;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(senha, salt);
        return hash;
    } catch (error) {
        console.error('Erro ao criar hash:', error);
        throw new Error('Erro ao criar hash');
    }
}

async function main() {
    await prisma.usuario.createMany({
        data: [{
            "nome": "Rita de Cássia",
            "email": "rita@gmail.com",
            "senha": await encripta("rita de cássia"),
            "telefone": "(19) 115585899",
            "cpf": "40569520860",
            "perfil": "Admin",
            "status": "Ativo",
            "dataNascimento": "2005-11-01T00:00:00.000Z",
            "endereco": "Rua das Flores, 123 - São Paulo/SP"
        }],
    })

    await prisma.cliente.createMany({
        data: [{
            "nome": "Maria Oliveira",
            "email": "maria.oliveira@email.com",
            "telefone": "(11) 91234-5678",
            "cpf": "123.456.789-09",
            "cnpj": null,
            "dataNascimento": "1990-05-15T00:00:00.000Z",
            "cep": "01310-100",
            "rua": "Rua Augusta",
            "numero": "1500",
            "complemento": "Apto 42",
            "bairro": "Consolação",
            "cidade": "São Paulo",
            "estado": "SP",
            "observacoes": "Cliente desde 2020",
            "usuarioId": 1
        },
        {
            "nome": "Ana Oliveira",
            "email": "ana.oliveira@email.com",
            "telefone": "(11) 91234-5600",
            "cpf": "855.294.634-36",
            "cnpj": null,
            "dataNascimento": "1990-11-15T00:00:00.000Z",
            "cep": "01310-100",
            "rua": "Rua Augusta",
            "numero": "1501",
            "complemento": "Apto 14",
            "bairro": "Consolação",
            "cidade": "São Paulo",
            "estado": "SP",
            "observacoes": "Cliente desde 2021",
            "usuarioId": 1
        }],
    })


    await prisma.produto.createMany({
        data: [{
            "nome": "Projetor Portátil 1080p",
            "descricao": "Projetor LED portátil com entrada HDMI e alto-falante.",
            "preco": 1299.00,
            "estoque": 12,
            "tipo": "Produto",
            "status": "Ativo"
        },
        {
            "nome": "Cachorro quente",
            "descricao": "Cachorro quente completo com salsicha, pão, molho e condimentos.",
            "preco": 20.00,
            "estoque": 100,
            "tipo": "Produto",
            "status": "Ativo"
        },
        {
            "nome": "Barba, cabelo e bigode",
            "descricao": "Serviço completo de barbearia incluindo corte de cabelo, barba e bigode.",
            "preco": 50.00,
            "tipo": "Serviço",
            "status": "Ativo"
        }],
    })

    await prisma.venda.createMany({
        data: [{
            "clienteId": 1,
            "usuarioId": 1,
            "status": "Concluida"
        },
        {
            "clienteId": 2,
            "usuarioId": 1,
            "status": "Concluida"
        }],
    })

    await prisma.itemVenda.createMany({
        data: [
            { "vendaId": 1, "produtoId": 1, "quantidade": 2, "precoUnit": 1299.00 },
            { "vendaId": 1, "produtoId": 2, "quantidade": 5, "precoUnit": 20.00 },
            { "vendaId": 2, "produtoId": 3, "quantidade": 1, "precoUnit": 50.00 },
        ],
    })

}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })