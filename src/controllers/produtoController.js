const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
 * Função para validar dados do produto
 */
function validarProduto(dados, isUpdate = false) {
  const errors = [];

  // Validações para criação
  if (!isUpdate) {
    if (!dados.nome || dados.nome.trim().length < 2) {
      errors.push('Nome é obrigatório e deve ter pelo menos 2 caracteres');
    }
    if (!dados.preco && dados.preco !== 0) {
      errors.push('Preço é obrigatório');
    }
  }

  // Validações específicas dos campos
  if (dados.nome && dados.nome.length > 255) {
    errors.push('Nome não pode exceder 255 caracteres');
  }

  if (dados.preco !== undefined && (isNaN(dados.preco) || dados.preco < 0)) {
    errors.push('Preço deve ser um número não negativo');
  }

  // VALIDAÇÃO MODIFICADA: Estoque é obrigatório apenas para produtos
  // Para serviços, pode ser null ou undefined
  if (dados.tipo === 'Produto' && dados.estoque !== undefined) {
    if (isNaN(dados.estoque) || dados.estoque < 0) {
      errors.push('Estoque deve ser um número não negativo');
    }
  }

  if (dados.descricao && dados.descricao.length > 500) {
    errors.push('Descrição não pode exceder 500 caracteres');
  }

  // Validação de enum
  const tiposValidos = ['Produto', 'Servico'];
  const statusValidos = ['Ativo', 'Inativo'];

  if (dados.tipo && !tiposValidos.includes(dados.tipo)) {
    errors.push(`Tipo deve ser: ${tiposValidos.join(' ou ')}`);
  }

  if (dados.status && !statusValidos.includes(dados.status)) {
    errors.push(`Status deve ser: ${statusValidos.join(' ou ')}`);
  }

  return errors;
}

// Criar produto/serviço
const create = async (req, res) => {
  try {
    const { nome, descricao, preco, estoque, tipo, status } = req.body;

    // Validar dados básicos
    const errors = validarProduto(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Dados inválidos',
        detalhes: errors 
      });
    }

    // VALIDAÇÃO CONDICIONAL: Estoque obrigatório apenas para produtos
    const tipoFinal = tipo || 'Produto';
    
    if (tipoFinal === 'Produto') {
      // Para produtos, estoque é obrigatório
      if (estoque === undefined || estoque === null || estoque === '') {
        return res.status(400).json({ 
          error: 'Dados inválidos',
          detalhes: ['Estoque é obrigatório para produtos'] 
        });
      }
      
      // Verificar se estoque é um número válido
      const estoqueNum = parseInt(estoque);
      if (isNaN(estoqueNum) || estoqueNum < 0) {
        return res.status(400).json({ 
          error: 'Dados inválidos',
          detalhes: ['Estoque deve ser um número não negativo'] 
        });
      }
    }

    // Verificar se produto/serviço com mesmo nome já existe
    const todosItens = await prisma.produto.findMany();
    const itemDuplicado = todosItens.find(item => 
      item.nome.toLowerCase() === nome.trim().toLowerCase()
    );

    if (itemDuplicado) {
      return res.status(400).json({ 
        error: 'Já existe um item com este nome' 
      });
    }

    // Preparar dados para criação
    const dadosCriacao = {
      nome: nome.trim(),
      descricao: descricao ? descricao.trim() : null,
      preco: parseFloat(preco),
      tipo: tipoFinal,
      status: status || 'Ativo',
    };

    // MODIFICAÇÃO: Estoque apenas para produtos, null para serviços
    if (tipoFinal === 'Produto') {
      dadosCriacao.estoque = parseInt(estoque);
    } else {
      // Serviços não têm estoque (pode ser null ou 0)
      dadosCriacao.estoque = null;
    }

    // Criar item
    const item = await prisma.produto.create({
      data: dadosCriacao,
      include: {
        _count: {
          select: {
            itensVenda: true
          }
        }
      }
    });

    // Formatar resposta
    const itemFormatado = {
      ...item,
      criadoEm: formatarData(item.criadoEm),
      atualizadoEm: formatarData(item.atualizadoEm),
      totalVendas: item._count.itensVenda
    };

    res.status(201).json({
      message: `${tipoFinal} criado com sucesso`,
      produto: itemFormatado
    });

  } catch (err) {
    console.error('Erro ao criar item:', err);
    
    if (err.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Já existe um item com este nome' 
      });
    }
    
    res.status(400).json({ 
      error: 'Erro ao criar item',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
    });
  }
};

// Listar todos os produtos/serviços com paginação e filtros
const findAll = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search,
      tipo,
      status,
      minPreco,
      maxPreco,
      estoqueMinimo
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construir where clause dinamicamente
    const where = {};
    
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (tipo) {
      where.tipo = tipo;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (minPreco || maxPreco) {
      where.preco = {};
      if (minPreco) where.preco.gte = parseFloat(minPreco);
      if (maxPreco) where.preco.lte = parseFloat(maxPreco);
    }
    
    // MODIFICAÇÃO: Para estoqueMinimo, apenas considerar produtos (não serviços)
    if (estoqueMinimo) {
      where.AND = [
        { tipo: 'Produto' },
        {
          estoque: {
            gte: parseInt(estoqueMinimo)
          }
        }
      ];
    }

    const [itens, total, totalServicos] = await Promise.all([
      prisma.produto.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          _count: {
            select: {
              itensVenda: true
            }
          }
        },
        orderBy: {
          criadoEm: 'desc'
        }
      }),
      prisma.produto.count({ where }),
      prisma.produto.count({ 
        where: { ...where, tipo: 'Servico' } 
      })
    ]);

    // CALCULAR ESTATÍSTICAS APENAS PARA PRODUTOS (não incluir serviços)
    const whereParaEstatisticas = { ...where, tipo: 'Produto' };
    
    const [estatisticas, valorTotalEstoque] = await Promise.all([
      prisma.produto.aggregate({
        where: whereParaEstatisticas,
        _sum: {
          estoque: true
        }
      }),
      prisma.produto.findMany({
        where: whereParaEstatisticas,
        select: {
          preco: true,
          estoque: true
        }
      }).then(produtos => {
        return produtos.reduce((total, produto) => {
          return total + (produto.preco * (produto.estoque || 0));
        }, 0);
      })
    ]);

    // Formatar itens
    const itensFormatados = itens.map(item => ({
      ...item,
      criadoEm: formatarData(item.criadoEm),
      atualizadoEm: formatarData(item.atualizadoEm),
      totalVendas: item._count.itensVenda,
      // Mostrar estoque apenas para produtos
      estoque: item.tipo === 'Produto' ? item.estoque : null
    }));

    res.json({
      produtos: itensFormatados,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      estatisticas: {
        totalItens: total,
        totalProdutos: total - totalServicos,
        totalServicos: totalServicos,
        estoqueTotal: estatisticas._sum.estoque || 0,
        valorTotalEstoque: valorTotalEstoque
      }
    });

  } catch (err) {
    console.error('Erro ao buscar itens:', err);
    res.status(500).json({ 
      error: 'Erro ao buscar itens',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
    });
  }
};

// Buscar produto/serviço por ID
const findOne = async (req, res) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const item = await prisma.produto.findUnique({
      where: { id },
      include: {
        itensVenda: {
          take: 10,
          include: {
            venda: {
              select: {
                id: true,
                data: true,
                total: true,
                cliente: {
                  select: {
                    id: true,
                    nome: true
                  }
                }
              }
            }
          },
          orderBy: {
            venda: {
              data: 'desc'
            }
          }
        },
        _count: {
          select: {
            itensVenda: true
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    // Formatar resposta
    const itemFormatado = {
      ...item,
      criadoEm: formatarData(item.criadoEm),
      atualizadoEm: formatarData(item.atualizadoEm),
      totalVendas: item._count.itensVenda,
      itensVenda: item.itensVenda.map(itemVenda => ({
        ...itemVenda,
        venda: {
          ...itemVenda.venda,
          data: formatarData(itemVenda.venda.data)
        }
      })),
      // Mostrar estoque apenas para produtos
      estoque: item.tipo === 'Produto' ? item.estoque : null
    };

    res.json(itemFormatado);

  } catch (err) {
    console.error('Erro ao buscar item:', err);
    res.status(500).json({ 
      error: 'Erro ao buscar item',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
    });
  }
};

// Atualizar produto/serviço
const update = async (req, res) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const dadosAtualizacao = { ...req.body };

    // Validar dados (modo update - campos parciais)
    const errors = validarProduto(dadosAtualizacao, true);
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Dados inválidos',
        detalhes: errors 
      });
    }

    // Verificar se item existe
    const itemExistente = await prisma.produto.findUnique({
      where: { id }
    });

    if (!itemExistente) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    // Determinar o tipo final
    const novoTipo = dadosAtualizacao.tipo || itemExistente.tipo;
    
    // VALIDAÇÃO: Se mudando de Serviço para Produto, estoque é obrigatório
    if (itemExistente.tipo === 'Servico' && novoTipo === 'Produto') {
      if (dadosAtualizacao.estoque === undefined || dadosAtualizacao.estoque === null) {
        return res.status(400).json({ 
          error: 'Dados inválidos',
          detalhes: ['Estoque é obrigatório ao alterar serviço para produto'] 
        });
      }
      
      // Verificar se estoque é um número válido
      const estoqueNum = parseInt(dadosAtualizacao.estoque);
      if (isNaN(estoqueNum) || estoqueNum < 0) {
        return res.status(400).json({ 
          error: 'Dados inválidos',
          detalhes: ['Estoque deve ser um número não negativo'] 
        });
      }
    }

    // Verificar duplicata de nome
    if (dadosAtualizacao.nome) {
      const todosItens = await prisma.produto.findMany({
        where: {
          id: { not: id }
        }
      });
      
      const itemDuplicado = todosItens.find(item => 
        item.nome.toLowerCase() === dadosAtualizacao.nome.trim().toLowerCase()
      );

      if (itemDuplicado) {
        return res.status(400).json({ 
          error: 'Já existe outro item com este nome' 
        });
      }
    }

    // Processar dados para atualização
    if (dadosAtualizacao.nome) {
      dadosAtualizacao.nome = dadosAtualizacao.nome.trim();
    }
    if (dadosAtualizacao.descricao) {
      dadosAtualizacao.descricao = dadosAtualizacao.descricao.trim();
    }
    if (dadosAtualizacao.preco) {
      dadosAtualizacao.preco = parseFloat(dadosAtualizacao.preco);
    }

    // MODIFICAÇÃO: Gerenciar estoque baseado no tipo
    if (dadosAtualizacao.tipo === 'Servico') {
      // Se for serviço, estoque deve ser null
      dadosAtualizacao.estoque = null;
    } else if (dadosAtualizacao.tipo === 'Produto') {
      // Se for produto e estoque foi fornecido, converter para inteiro
      if (dadosAtualizacao.estoque !== undefined && dadosAtualizacao.estoque !== null) {
        dadosAtualizacao.estoque = parseInt(dadosAtualizacao.estoque);
      }
      // Se não foi fornecido e já é um produto, manter o estoque atual
    }

    // Atualizar item
    const item = await prisma.produto.update({
      where: { id },
      data: dadosAtualizacao,
      include: {
        _count: {
          select: {
            itensVenda: true
          }
        }
      }
    });

    const itemFormatado = {
      ...item,
      criadoEm: formatarData(item.criadoEm),
      atualizadoEm: formatarData(item.atualizadoEm),
      totalVendas: item._count.itensVenda,
      // Mostrar estoque apenas para produtos
      estoque: item.tipo === 'Produto' ? item.estoque : null
    };

    res.json({
      message: `${item.tipo} atualizado com sucesso`,
      produto: itemFormatado
    });

  } catch (err) {
    console.error('Erro ao atualizar item:', err);
    
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    
    res.status(400).json({ 
      error: 'Erro ao atualizar item',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
    });
  }
};

// Deletar produto/serviço
const remove = async (req, res) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    // Verificar se item existe e tem vendas associadas
    const item = await prisma.produto.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            itensVenda: true
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    // Verificar se item tem vendas associadas
    if (item._count.itensVenda > 0) {
      return res.status(400).json({ 
        error: 'Não é possível deletar item com vendas associadas',
        detalhes: {
          totalVendas: item._count.itensVenda,
          sugestao: 'Altere o status do item para inativo'
        }
      });
    }

    await prisma.produto.delete({ 
      where: { id } 
    });

    res.json({ 
      message: 'Item deletado com sucesso',
      id: id
    });

  } catch (err) {
    console.error('Erro ao deletar item:', err);
    
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    
    res.status(400).json({ 
      error: 'Erro ao deletar item',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
    });
  }
};

// Buscar produtos com estoque baixo (apenas produtos, serviços não aparecem)
const findLowStock = async (req, res) => {
  try {
    const { limite = 10 } = req.query;

    const produtos = await prisma.produto.findMany({
      where: {
        AND: [
          { tipo: 'Produto' },
          { status: 'Ativo' },
          {
            OR: [
              { estoque: { lte: parseInt(limite) } },
              { estoque: null } // Incluir produtos sem estoque definido
            ]
          }
        ]
      },
      include: {
        _count: {
          select: {
            itensVenda: true
          }
        }
      },
      orderBy: {
        estoque: 'asc'
      }
    });

    const produtosFormatados = produtos.map(produto => ({
      ...produto,
      criadoEm: formatarData(produto.criadoEm),
      atualizadoEm: formatarData(produto.atualizadoEm),
      totalVendas: produto._count.itensVenda
    }));

    res.json({
      produtos: produtosFormatados,
      total: produtos.length,
      limiteEstoque: parseInt(limite)
    });

  } catch (err) {
    console.error('Erro ao buscar produtos com estoque baixo:', err);
    res.status(500).json({ 
      error: 'Erro ao buscar produtos com estoque baixo',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
    });
  }
};

module.exports = {
  create,
  findAll,
  findOne,
  update,
  remove,
  findLowStock
};