use anchor_lang::prelude::*;

declare_id!("DHU9UBVaZNtw77FabwS7JmCxrgnNPA6Zg18xBPfB3rZ");

/// Solana个人Agent注册合约
/// 功能：纯粹的个人Agent注册、管理和训练数据
/// 对应EVM的AgentRegistry.ts

#[program]
pub mod solana_agent_registry {
    use super::*;

    /// 初始化Agent注册表
    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.agent_counter = 0;
        registry.bump = ctx.bumps["registry"];
        
        msg!("Agent Registry initialized with authority: {}", registry.authority);
        Ok(())
    }

    /// 注册新Agent
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        description: String,
        agent_type: String,
        ipfs_hash: String,
        image_url: String,
    ) -> Result<()> {
        // 参数验证
        require!(name.len() <= 32, ErrorCode::NameTooLong);
        require!(description.len() <= 200, ErrorCode::DescriptionTooLong);
        require!(agent_type.len() <= 32, ErrorCode::TypeTooLong);
        require!(ipfs_hash.len() <= 64, ErrorCode::IpfsHashTooLong);
        require!(image_url.len() <= 128, ErrorCode::ImageUrlTooLong);

        let registry = &mut ctx.accounts.registry;
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        // 设置Agent数据
        agent.id = registry.agent_counter;
        agent.owner = ctx.accounts.user.key();
        agent.name = name.clone();
        agent.description = description.clone();
        agent.agent_type = agent_type.clone();
        agent.ipfs_hash = ipfs_hash.clone();
        agent.image_url = image_url;
        agent.is_public = false;
        agent.created_at = clock.unix_timestamp;
        agent.updated_at = clock.unix_timestamp;
        agent.bump = ctx.bumps["agent"];

        // 更新计数器
        registry.agent_counter += 1;

        // 发出事件
        emit!(AgentRegistered {
            agent_id: agent.id,
            owner: agent.owner,
            name: name,
            agent_type: agent_type,
            ipfs_hash: ipfs_hash,
        });

        msg!("Agent registered successfully: ID {}, Name: {}", agent.id, agent.name);
        Ok(())
    }

    /// 批量注册Agent（对应EVM的betchregisterAgent）
    pub fn batch_register_agents(
        ctx: Context<BatchRegisterAgents>,
        names: Vec<String>,
        descriptions: Vec<String>,
        agent_types: Vec<String>,
        ipfs_hashes: Vec<String>,
    ) -> Result<Vec<u64>> {
        require!(names.len() == descriptions.len(), ErrorCode::ArrayLengthMismatch);
        require!(names.len() == agent_types.len(), ErrorCode::ArrayLengthMismatch);
        require!(names.len() == ipfs_hashes.len(), ErrorCode::ArrayLengthMismatch);
        require!(names.len() <= 10, ErrorCode::BatchSizeTooLarge); // 最多10个

        let registry = &mut ctx.accounts.registry;
        let clock = Clock::get()?;
        let mut agent_ids = Vec::new();

        for i in 0..names.len() {
            // 验证参数
            require!(names[i].len() <= 32, ErrorCode::NameTooLong);
            require!(descriptions[i].len() <= 200, ErrorCode::DescriptionTooLong);
            require!(agent_types[i].len() <= 32, ErrorCode::TypeTooLong);
            require!(ipfs_hashes[i].len() <= 64, ErrorCode::IpfsHashTooLong);

            let agent_id = registry.agent_counter;
            agent_ids.push(agent_id);
            
            // 这里需要动态创建Agent账户，在实际实现中需要额外的逻辑
            // 或者要求前端预先创建所有Agent PDA
            
            registry.agent_counter += 1;

            emit!(AgentRegistered {
                agent_id,
                owner: ctx.accounts.user.key(),
                name: names[i].clone(),
                agent_type: agent_types[i].clone(),
                ipfs_hash: ipfs_hashes[i].clone(),
            });
        }

        msg!("Batch registered {} agents", names.len());
        Ok(agent_ids)
    }

    /// 更新Agent信息
    pub fn update_agent(
        ctx: Context<UpdateAgent>,
        name: Option<String>,
        description: Option<String>,
        agent_type: Option<String>,
        image_url: Option<String>,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        // 更新提供的字段
        if let Some(new_name) = name {
            require!(new_name.len() <= 32, ErrorCode::NameTooLong);
            agent.name = new_name;
        }
        
        if let Some(new_description) = description {
            require!(new_description.len() <= 200, ErrorCode::DescriptionTooLong);
            agent.description = new_description;
        }
        
        if let Some(new_type) = agent_type {
            require!(new_type.len() <= 32, ErrorCode::TypeTooLong);
            agent.agent_type = new_type;
        }
        
        if let Some(new_image_url) = image_url {
            require!(new_image_url.len() <= 128, ErrorCode::ImageUrlTooLong);
            agent.image_url = new_image_url;
        }

        agent.updated_at = clock.unix_timestamp;

        emit!(AgentUpdated {
            agent_id: agent.id,
            updated_at: agent.updated_at,
        });

        msg!("Agent {} updated successfully", agent.id);
        Ok(())
    }

    /// 切换Agent公开状态（对应EVM的toggleAgentPublicity）
    pub fn toggle_agent_publicity(ctx: Context<ToggleAgentPublic>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.is_public = !agent.is_public;
        agent.updated_at = Clock::get()?.unix_timestamp;

        emit!(AgentPublicityToggled {
            agent_id: agent.id,
            is_public: agent.is_public,
        });

        msg!("Agent {} publicity toggled to: {}", agent.id, agent.is_public);
        Ok(())
    }

    /// 添加训练数据
    pub fn add_training_data(
        ctx: Context<AddTrainingData>,
        ipfs_hash: String,
        data_type: String,
    ) -> Result<()> {
        require!(ipfs_hash.len() <= 64, ErrorCode::IpfsHashTooLong);
        require!(data_type.len() <= 32, ErrorCode::DataTypeTooLong);

        let training_data = &mut ctx.accounts.training_data;
        let clock = Clock::get()?;

        training_data.agent_id = ctx.accounts.agent.id;
        training_data.ipfs_hash = ipfs_hash.clone();
        training_data.data_type = data_type.clone();
        training_data.timestamp = clock.unix_timestamp;
        training_data.bump = ctx.bumps["training_data"];

        emit!(TrainingDataAdded {
            agent_id: training_data.agent_id,
            ipfs_hash: ipfs_hash,
            data_type: data_type,
            timestamp: training_data.timestamp,
        });

        msg!("Training data added for agent {}", training_data.agent_id);
        Ok(())
    }

    /// 获取Agent计数（对应EVM的getAgentCount）
    pub fn get_agent_count(ctx: Context<GetAgentCount>) -> Result<u64> {
        Ok(ctx.accounts.registry.agent_counter)
    }
}

// ===== 数据结构定义 =====

/// Agent注册表全局状态
#[account]
pub struct AgentRegistry {
    pub authority: Pubkey,      // 程序管理员
    pub agent_counter: u64,     // Agent计数器
    pub bump: u8,              // PDA bump
}

impl AgentRegistry {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

/// 个人Agent账户
#[account]
pub struct Agent {
    pub id: u64,               // Agent唯一ID
    pub owner: Pubkey,         // 所有者钱包地址
    pub name: String,          // Agent名称（最大32字符）
    pub description: String,   // 描述（最大200字符）
    pub agent_type: String,    // 类型（最大32字符）
    pub ipfs_hash: String,     // IPFS配置哈希（最大64字符）
    pub image_url: String,     // 图片URL（最大128字符）
    pub is_public: bool,       // 是否公开
    pub created_at: i64,       // 创建时间戳
    pub updated_at: i64,       // 更新时间戳
    pub bump: u8,              // PDA bump
}

impl Agent {
    pub const SPACE: usize = 8 + 8 + 32 + (4+32) + (4+200) + (4+32) + (4+64) + (4+128) + 1 + 8 + 8 + 1;
}

/// 训练数据记录
#[account]
pub struct TrainingData {
    pub agent_id: u64,         // 关联的Agent ID
    pub ipfs_hash: String,     // 训练数据IPFS哈希
    pub data_type: String,     // 数据类型（text/url/hyperlink）
    pub timestamp: i64,        // 创建时间戳
    pub bump: u8,              // PDA bump
}

impl TrainingData {
    pub const SPACE: usize = 8 + 8 + (4+64) + (4+32) + 8 + 1;
}

// ===== 账户验证结构 =====

/// 初始化Agent注册表
#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = AgentRegistry::SPACE,
        seeds = [b"agent_registry"],
        bump
    )]
    pub registry: Account<'info, AgentRegistry>,
    
    pub system_program: Program<'info, System>,
}

/// 注册新Agent
#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"agent_registry"],
        bump = registry.bump
    )]
    pub registry: Account<'info, AgentRegistry>,
    
    #[account(
        init,
        payer = user,
        space = Agent::SPACE,
        seeds = [b"agent", user.key().as_ref(), registry.agent_counter.to_le_bytes().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    
    pub system_program: Program<'info, System>,
}

/// 批量注册Agent
#[derive(Accounts)]
pub struct BatchRegisterAgents<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"agent_registry"],
        bump = registry.bump
    )]
    pub registry: Account<'info, AgentRegistry>,
    
    pub system_program: Program<'info, System>,
}

/// 更新Agent信息
#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"agent", agent.owner.as_ref(), agent.id.to_le_bytes().as_ref()],
        bump = agent.bump,
        constraint = agent.owner == user.key() @ ErrorCode::UnauthorizedOwner
    )]
    pub agent: Account<'info, Agent>,
}

/// 切换Agent公开状态
#[derive(Accounts)]
pub struct ToggleAgentPublic<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"agent", agent.owner.as_ref(), agent.id.to_le_bytes().as_ref()],
        bump = agent.bump,
        constraint = agent.owner == user.key() @ ErrorCode::UnauthorizedOwner
    )]
    pub agent: Account<'info, Agent>,
}

/// 添加训练数据
#[derive(Accounts)]
pub struct AddTrainingData<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        seeds = [b"agent", agent.owner.as_ref(), agent.id.to_le_bytes().as_ref()],
        bump = agent.bump,
        constraint = agent.owner == user.key() @ ErrorCode::UnauthorizedOwner
    )]
    pub agent: Account<'info, Agent>,
    
    #[account(
        init,
        payer = user,
        space = TrainingData::SPACE,
        seeds = [
            b"training_data", 
            agent.id.to_le_bytes().as_ref(), 
            &Clock::get()?.unix_timestamp.to_le_bytes()
        ],
        bump
    )]
    pub training_data: Account<'info, TrainingData>,
    
    pub system_program: Program<'info, System>,
}

/// 获取Agent计数
#[derive(Accounts)]
pub struct GetAgentCount<'info> {
    #[account(
        seeds = [b"agent_registry"],
        bump = registry.bump
    )]
    pub registry: Account<'info, AgentRegistry>,
}

// ===== 事件定义 =====

#[event]
pub struct AgentRegistered {
    pub agent_id: u64,
    pub owner: Pubkey,
    pub name: String,
    pub agent_type: String,
    pub ipfs_hash: String,
}

#[event]
pub struct AgentUpdated {
    pub agent_id: u64,
    pub updated_at: i64,
}

#[event]
pub struct AgentPublicityToggled {
    pub agent_id: u64,
    pub is_public: bool,
}

#[event]
pub struct TrainingDataAdded {
    pub agent_id: u64,
    pub ipfs_hash: String,
    pub data_type: String,
    pub timestamp: i64,
}

// ===== 错误代码定义 =====

#[error_code]
pub enum ErrorCode {
    #[msg("Name is too long (max 32 characters)")]
    NameTooLong,
    #[msg("Description is too long (max 200 characters)")]
    DescriptionTooLong,
    #[msg("Agent type is too long (max 32 characters)")]
    TypeTooLong,
    #[msg("IPFS hash is too long (max 64 characters)")]
    IpfsHashTooLong,
    #[msg("Image URL is too long (max 128 characters)")]
    ImageUrlTooLong,
    #[msg("Data type is too long (max 32 characters)")]
    DataTypeTooLong,
    #[msg("Unauthorized: not the owner")]
    UnauthorizedOwner,
    #[msg("Array length mismatch")]
    ArrayLengthMismatch,
    #[msg("Batch size too large (max 10)")]
    BatchSizeTooLarge,
}