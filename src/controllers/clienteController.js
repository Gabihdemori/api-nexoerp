const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


/**
 * Função para converter data do formato "dd-mm-aaaa" para Date
 */
function converterDataDDMMAAAA(dataString) {
  if (!dataString) return null;
  
  // Verificar se está no formato dd-mm-aaaa
  const partes = dataString.split('-');
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1; 
    const ano = parseInt(partes[2], 10);
    
    const data = new Date(ano, mes, dia);
    
    // Validar se a data é válida
    if (data.getDate() === dia && data.getMonth() === mes && data.getFullYear() === ano) {
      return data;
    }
  }
  
  // Se não for dd-mm-aaaa, tenta o parser padrão como fallback
  const data = new Date(dataString);
  return isNaN(data.getTime()) ? null : data;
}

/**
 * Função para formatar datas no padrão dd/mm/aa HH:MM
 */
function formatarData(data) {
  if (!data) return null;
  const date = new Date(data);
  
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const ano = date.getFullYear().toString().slice(-2);
  const horas = date.getHours().toString().padStart(2, '0');
  const minutos = date.getMinutes().toString().padStart(2, '0');
  
  return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
}

/**
 * Função para formatar data de nascimento no padrão dd/mm/aaaa
 */
function formatarDataNascimento(data) {
  if (!data) return null;
  const date = new Date(data);
  
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const ano = date.getFullYear().toString();
  
  return `${dia}/${mes}/${ano}`;
}

/**
 * Função para validar CPF (formato básico)
 */
function validarCPF(cpf) {
  if (!cpf) return true; // CPF é opcional
  const cpfLimpo = cpf.replace(/\D/g, '');
  return cpfLimpo.length === 11;
}

/**
 * Função para validar CNPJ (formato básico)
 */
function validarCNPJ(cnpj) {
  if (!cnpj) return true; // CNPJ é opcional
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  return cnpjLimpo.length === 14;
}

/**
 * Função para validar email
 */
function validarEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Função para validar telefone
 */
function validarTelefone(telefone) {
  const telefoneLimpo = telefone.replace(/\D/g, '');
  return telefoneLimpo.length >= 10 && telefoneLimpo.length <= 11;
}

/**
 * Função para validar data de nascimento
 */
function validarDataNascimento(dataNascimento) {
  if (!dataNascimento) return true; // Opcional
  
  const dataConvertida = converterDataDDMMAAAA(dataNascimento);
  if (!dataConvertida) {
    return false;
  }
  
  // Não permitir datas futuras
  const hoje = new Date();
  return dataConvertida <= hoje;
}

/**
 * Função para validar dados do cliente
 */
function validarCliente(dados, isUpdate = false) {
  const errors = [];

  // Validações para criação (não aplicáveis em update parcial)
  if (!isUpdate) {
    if (!dados.nome || dados.nome.trim().length < 2) {
      errors.push('Nome é obrigatório e deve ter pelo menos 2 caracteres');
    }
    if (!dados.email) {
      errors.push('Email é obrigatório');
    }
    if (!dados.telefone) {
      errors.push('Telefone é obrigatório');
    }
    if (!dados.usuarioId) {
      errors.push('usuarioId é obrigatório');
    }
  }

  // Validações específicas dos campos (se fornecidos)
  if (dados.nome && dados.nome.length > 255) {
    errors.push('Nome não pode exceder 255 caracteres');
  }

  if (dados.email && !validarEmail(dados.email)) {
    errors.push('Email com formato inválido');
  }

  if (dados.telefone && !validarTelefone(dados.telefone)) {
    errors.push('Telefone com formato inválido');
  }

  if (dados.cpf && !validarCPF(dados.cpf)) {
    errors.push('CPF com formato inválido (deve ter 11 dígitos)');
  }

  if (dados.cnpj && !validarCNPJ(dados.cnpj)) {
    errors.push('CNPJ com formato inválido (deve ter 14 dígitos)');
  }

  // Validação de data de nascimento
  if (dados.dataNascimento && !validarDataNascimento(dados.dataNascimento)) {
    errors.push('Data de nascimento inválida ou futura. Use o formato dd-mm-aaaa');
  }

  // Validação de CPF/CNPJ mutuamente exclusivos
  if (dados.cpf && dados.cnpj) {
    errors.push('Cliente não pode ter CPF e CNPJ simultaneamente');
  }

  return errors;
}


// Criar Cliente
const create = async (req, res) => {
  try {
    const { usuarioId, dataNascimento, ...dadosCliente } = req.body;


    const dataNascimentoFornecida = dataNascimento || dataNascimento;

    // Validações básicas
    if (!usuarioId) {
      return res.status(400).json({ 
        erro: 'usuarioId é obrigatório' 
      });
    }

    // Converter data de nascimento se fornecida
    let dataNascimentoConvertida = null;
    if (dataNascimentoFornecida) {
      dataNascimentoConvertida = converterDataDDMMAAAA(dataNascimentoFornecida);
      if (!dataNascimentoConvertida) {
        return res.status(400).json({ 
          erro: 'Data de nascimento inválida. Use o formato dd-mm-aaaa' 
        });
      }
    }

    // Validar dados do cliente
    const errors = validarCliente({ ...dadosCliente, usuarioId, dataNascimento: dataNascimentoFornecida });
    if (errors.length > 0) {
      return res.status(400).json({ 
        erro: 'Dados inválidos', 
        detalhes: errors 
      });
    }

    // Verificar se usuário existe
    const usuarioExiste = await prisma.usuario.findUnique({
      where: { id: parseInt(usuarioId) }
    });

    if (!usuarioExiste) {
      return res.status(400).json({ 
        erro: 'Usuário não encontrado' 
      });
    }

    // Verificar duplicatas (email, telefone, cpf, cnpj)
    const whereConditions = [];
    
    if (dadosCliente.email) {
      whereConditions.push({ email: dadosCliente.email });
    }
    if (dadosCliente.telefone) {
      whereConditions.push({ telefone: dadosCliente.telefone });
    }
    if (dadosCliente.cpf) {
      whereConditions.push({ cpf: dadosCliente.cpf });
    }
    if (dadosCliente.cnpj) {
      whereConditions.push({ cnpj: dadosCliente.cnpj });
    }

    if (whereConditions.length > 0) {
      const clienteDuplicado = await prisma.cliente.findFirst({
        where: {
          OR: whereConditions
        }
      });

      if (clienteDuplicado) {
        return res.status(400).json({ 
          erro: 'Já existe um cliente com este email, telefone, CPF ou CNPJ' 
        });
      }
    }

    // Criar cliente
    const cliente = await prisma.cliente.create({
      data: {
        ...dadosCliente,
        dataNascimento: dataNascimentoConvertida,
        usuarioId: parseInt(usuarioId)
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true
          }
        },
        vendas: {
          take: 5, // Limitar para não sobrecarregar a resposta
          orderBy: {
            data: 'desc'
          },
          select: {
            id: true,
            data: true,
            total: true,
            status: true
          }
        }
      }
    });

    // Formatar resposta
    const clienteFormatado = {
      ...cliente,
      dataNascimento: formatarDataNascimento(cliente.dataNascimento),
      criadoEm: formatarData(cliente.criadoEm),
      atualizadoEm: formatarData(cliente.atualizadoEm),
      vendas: cliente.vendas.map(venda => ({
        ...venda,
        data: formatarData(venda.data)
      }))
    };

    res.status(201).json({
      mensagem: 'Cliente criado com sucesso',
      cliente: clienteFormatado
    });

  } catch (err) {
    console.error('Erro ao criar cliente:', err);
    
    if (err.code === 'P2002') {
      return res.status(400).json({ 
        erro: 'Violação de constraint única', 
        detalhes: 'Email, telefone, CPF ou CNPJ já está em uso' 
      });
    }
    
    res.status(400).json({ 
      erro: 'Erro ao cadastrar cliente.', 
      detalhes: err.message 
    });
  }
};

// Listar Todos os Clientes com Paginação e Filtros
const findAll = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search,
      tipo, // 'cpf' ou 'cnpj'
      usuarioId 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construir where clause dinamicamente
    const where = {};
    
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { telefone: { contains: search } }
      ];
    }
    
    if (tipo === 'cpf') {
      where.cpf = { not: null };
    } else if (tipo === 'cnpj') {
      where.cnpj = { not: null };
    }
    
    if (usuarioId && !isNaN(usuarioId)) {
      where.usuarioId = parseInt(usuarioId);
    }

    const [clientes, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          usuario: {
            select: {
              id: true,
              nome: true
            }
          },
          _count: {
            select: {
              vendas: true
            }
          }
        },
        orderBy: {
          criadoEm: 'desc'
        }
      }),
      prisma.cliente.count({ where })
    ]);

    // Formatar clientes
    const clientesFormatados = clientes.map(cliente => ({
      ...cliente,
      dataNascimento: formatarDataNascimento(cliente.dataNascimento),
      criadoEm: formatarData(cliente.criadoEm),
      atualizadoEm: formatarData(cliente.atualizadoEm),
      totalVendas: cliente._count.vendas
    }));

    res.json({
      clientes: clientesFormatados,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (err) {
    console.error('Erro ao buscar clientes:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar clientes.', 
      detalhes: err.message 
    });
  }
};

// Buscar Cliente por ID
const findOne = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true
          }
        },
        vendas: {
          include: {
            itens: {
              include: {
                produto: {
                  select: {
                    id: true,
                    nome: true,
                    preco: true
                  }
                }
              }
            }
          },
          orderBy: {
            data: 'desc'
          }
        }
      }
    });

    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    // Formatar resposta
    const clienteFormatado = {
      ...cliente,
      dataNascimento: formatarDataNascimento(cliente.dataNascimento),
      criadoEm: formatarData(cliente.criadoEm),
      atualizadoEm: formatarData(cliente.atualizadoEm),
      vendas: cliente.vendas.map(venda => ({
        ...venda,
        data: formatarData(venda.data),
        itens: venda.itens.map(item => ({
          ...item,
          produto: {
            ...item.produto,
            criadoEm: formatarData(item.produto.criadoEm)
          }
        }))
      }))
    };

    res.json(clienteFormatado);

  } catch (err) {
    console.error('Erro ao buscar cliente:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar cliente.', 
      detalhes: err.message 
    });
  }
};

// Buscar Cliente por CPF ou CNPJ
const findByDocumento = async (req, res) => {
  const { documento } = req.query;

  if (!documento) {
    return res.status(400).json({ 
      erro: 'Informe um CPF ou CNPJ válido na query string.' 
    });
  }

  // Limpar documento (remover caracteres não numéricos)
  const documentoLimpo = documento.replace(/\D/g, '');

  try {
    const cliente = await prisma.cliente.findFirst({
      where: {
        OR: [
          { cpf: documentoLimpo },
          { cnpj: documentoLimpo }
        ]
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true
          }
        },
        _count: {
          select: {
            vendas: true
          }
        }
      }
    });

    if (!cliente) {
      return res.status(404).json({ 
        erro: 'Cliente não encontrado com o CPF ou CNPJ informado.' 
      });
    }

    const clienteFormatado = {
      ...cliente,
      dataNascimento: formatarDataNascimento(cliente.dataNascimento),
      criadoEm: formatarData(cliente.criadoEm),
      atualizadoEm: formatarData(cliente.atualizadoEm),
      totalVendas: cliente._count.vendas
    };

    res.json(clienteFormatado);

  } catch (err) {
    console.error('Erro ao buscar cliente por documento:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar cliente por CPF ou CNPJ.', 
      detalhes: err.message 
    });
  }
};

// Atualizar Cliente
const update = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                error: 'ID inválido',
                message: 'O ID deve ser um número positivo'
            });
        }

        const dadosAtualizacao = { ...req.body };

        /**
         * ===============================
         *  TRATAMENTO CORRETO DE DATA
         * ===============================
         */
        if (dadosAtualizacao.dataNascimento) {
            console.log('Data recebida:', dadosAtualizacao.dataNascimento);

            // Se for string → converte com sua função
            if (typeof dadosAtualizacao.dataNascimento === "string") {

                const dataConvertida = converterDataDDMMAAAA(dadosAtualizacao.dataNascimento);

                if (!dataConvertida) {
                    return res.status(400).json({
                        success: false,
                        error: 'Data inválida',
                        message: 'Formato de data inválido. Use dd-mm-aaaa.'
                    });
                }

                dadosAtualizacao.dataNascimento = dataConvertida;
                console.log("Data convertida:", dataConvertida);
            }

            // Se for Date → não faz nada
            else if (dadosAtualizacao.dataNascimento instanceof Date) {
                console.log("Data já é Date válido.");
            }

            // Qualquer outro tipo → erro
            else {
                return res.status(400).json({
                    success: false,
                    error: "Tipo inválido",
                    message: "Data de nascimento deve ser string ou Date."
                });
            }
        } else {
            dadosAtualizacao.dataNascimento = null;
        }

        /**
         * ===============================
         *  VALIDAÇÃO DO CLIENTE
         * ===============================
         */
        const errors = validarCliente(dadosAtualizacao, true);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Dados inválidos',
                details: errors
            });
        }

        /**
         * ===============================
         *  VERIFICAR SE CLIENTE EXISTE
         * ===============================
         */
        const clienteExistente = await prisma.cliente.findUnique({
            where: { id },
            select: { id: true }
        });

        if (!clienteExistente) {
            return res.status(404).json({
                success: false,
                error: 'Não encontrado',
                message: 'Cliente não encontrado'
            });
        }

        /**
         * ===============================
         *  VERIFICAR DADOS DUPLICADOS
         * ===============================
         */
        const conditions = [];
        if (dadosAtualizacao.email) conditions.push({ email: dadosAtualizacao.email });
        if (dadosAtualizacao.telefone) conditions.push({ telefone: dadosAtualizacao.telefone });
        if (dadosAtualizacao.cpf) conditions.push({ cpf: dadosAtualizacao.cpf });
        if (dadosAtualizacao.cnpj) conditions.push({ cnpj: dadosAtualizacao.cnpj });

        if (conditions.length > 0) {
            const clienteDuplicado = await prisma.cliente.findFirst({
                where: {
                    AND: [
                        { id: { not: id } },
                        { OR: conditions }
                    ]
                }
            });

            if (clienteDuplicado) {
                return res.status(409).json({
                    success: false,
                    error: 'Dados duplicados',
                    message: 'Já existe outro cliente com este email, telefone, CPF ou CNPJ'
                });
            }
        }

        /**
         * ===============================
         *  ATUALIZAÇÃO NO BANCO
         * ===============================
         */
        console.log('Dados finais para atualização:', dadosAtualizacao);

        const cliente = await prisma.cliente.update({
            where: { id },
            data: dadosAtualizacao,
            include: {
                usuario: {
                    select: {
                        id: true,
                        nome: true
                    }
                }
            }
        });

        /**
         * ===============================
         *  FORMATAÇÃO PARA RESPOSTA
         * ===============================
         */
        const clienteFormatado = {
            ...cliente,
            dataNascimento: formatarDataNascimento(cliente.dataNascimento),
            criadoEm: formatarData(cliente.criadoEm),
            atualizadoEm: formatarData(cliente.atualizadoEm)
        };

        res.json({
            success: true,
            message: 'Cliente atualizado com sucesso',
            data: clienteFormatado
        });

    } catch (error) {
        console.error('Erro detalhado no update:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Não encontrado',
                message: 'Cliente não encontrado'
            });
        }

        if (error.code === 'P2002') {
            return res.status(409).json({
                success: false,
                error: 'Dados duplicados',
                message: 'Já existe um cliente com estes dados'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: 'Erro ao atualizar cliente'
        });
    }
};


// Deletar Cliente
const remove = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    // Verificar se cliente existe e tem vendas
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            vendas: true
          }
        }
      }
    });

    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    // Verificar se cliente tem vendas associadas
    if (cliente._count.vendas > 0) {
      return res.status(400).json({ 
        erro: 'Não é possível deletar cliente com vendas associadas.',
        detalhes: {
          totalVendas: cliente._count.vendas,
          sugestao: 'Altere o status do cliente para inativo ou archive os dados.'
        }
      });
    }

    await prisma.cliente.delete({ 
      where: { id } 
    });

    res.json({ 
      mensagem: 'Cliente deletado com sucesso.',
      id: id
    });

  } catch (err) {
    console.error('Erro ao deletar cliente:', err);
    
    if (err.code === 'P2025') {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    
    res.status(400).json({ 
      erro: 'Erro ao deletar cliente.', 
      detalhes: err.message 
    });
  }
};

module.exports = {
  create,
  findAll,
  findOne,
  findByDocumento,
  update,
  remove
};
