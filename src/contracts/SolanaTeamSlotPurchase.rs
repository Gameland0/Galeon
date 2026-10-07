use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};

declare_id!("H7HaNptFbTxm4E2s7vdpaPFQFwdLT49YK7Z6BffxiuWm");

/// Solana团队Slot购买合约
/// 功能：团队额度购买、支付处理和用户限制管理
/// 对应EVM的TeamRegistry.ts中的buyteamamount相关功能
/// 
/// 支持SOL和USDC支付，价格2 USDT等值
/// Devnet测试USDC: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
/// 统一收款地址（SOL和USDC）: 8TcQfQY12sMweH9EkvrrXbcgSeB5KGLTUPA4Jmixpm74


#[program]
pub mod solana_team_slot_purchase {
    use super::*;

    /// 初始化Slot购买系统
    pub fn initialize_slot_system(
        ctx: Context<InitializeSlotSystem>,
        slot_price_sol: u64,
        slot_price_usdc: u64,
        default_team_limit: u8,
    ) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        
        slot_config.authority = ctx.accounts.authority.key();
        slot_config.treasury_sol = ctx.accounts.treasury_sol.key();
        slot_config.treasury_usdc = ctx.accounts.treasury_usdc.key();
        slot_config.usdc_mint = ctx.accounts.usdc_mint.key();
        slot_config.slot_price_sol = slot_price_sol;
        slot_config.slot_price_usdc = slot_price_usdc;
        slot_config.default_team_limit = default_team_limit;
        slot_config.total_slots_sold = 0;
        slot_config.is_active = true;
        slot_config.bump = ctx.bumps.slot_config;
        
        msg!("Team Slot Purchase system initialized");
        msg!("SOL price: {} lamports", slot_price_sol);
        msg!("USDC price: {} tokens", slot_price_usdc);
        Ok(())
    }

    /// 使用指定收款地址初始化系统
    pub fn initialize_with_treasury(
        ctx: Context<InitializeSlotSystem>,
        slot_price_sol: u64,
        slot_price_usdc: u64,
        default_team_limit: u8,
    ) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        
        slot_config.authority = ctx.accounts.authority.key();
        slot_config.treasury_sol = ctx.accounts.treasury_sol.key();
        slot_config.treasury_usdc = ctx.accounts.treasury_usdc.key();
        slot_config.usdc_mint = ctx.accounts.usdc_mint.key();
        slot_config.slot_price_sol = slot_price_sol;
        slot_config.slot_price_usdc = slot_price_usdc;
        slot_config.default_team_limit = default_team_limit;
        slot_config.total_slots_sold = 0;
        slot_config.is_active = true;
        slot_config.bump = ctx.bumps.slot_config;
        
        msg!("Team Slot Purchase system initialized");
        Ok(())
    }

    /// 初始化用户团队限制
    pub fn initialize_user_limit(ctx: Context<InitializeUserLimit>) -> Result<()> {
        let slot_config = &ctx.accounts.slot_config;
        let user_limit = &mut ctx.accounts.user_limit;
        
        user_limit.user = ctx.accounts.user.key();
        user_limit.team_limit = slot_config.default_team_limit;
        user_limit.teams_created = 0;
        user_limit.total_spent_sol = 0;
        user_limit.total_spent_usdc = 0;
        user_limit.slots_purchased = 0;
        user_limit.bump = ctx.bumps.user_limit;
        
        msg!("User team limit initialized for: {}", user_limit.user);
        Ok(())
    }

    /// 使用SOL购买团队slot（对应EVM的buyteamamount）
    pub fn buy_team_slot_sol(ctx: Context<BuyTeamSlotSol>) -> Result<()> {
        let slot_config = &ctx.accounts.slot_config;
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(slot_config.is_active, ErrorCode::SystemNotActive);
        require!(slot_config.slot_price_sol > 0, ErrorCode::InvalidPrice);
        
        // SOL支付转账
        let transfer_instruction = system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.treasury_sol.to_account_info(),
        };
        
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_instruction),
            slot_config.slot_price_sol,
        )?;
        
        // 更新用户限制
        user_limit.team_limit += 1;
        user_limit.total_spent_sol += slot_config.slot_price_sol;
        user_limit.slots_purchased += 1;
        
        // 更新全局统计
        let slot_config = &mut ctx.accounts.slot_config;
        slot_config.total_slots_sold += 1;
        
        emit!(TeamSlotPurchased {
            user: user_limit.user,
            payment_type: PaymentType::Sol,
            amount_paid: slot_config.slot_price_sol,
            new_team_limit: user_limit.team_limit,
            transaction_id: Clock::get()?.unix_timestamp,
        });
        
        msg!("Team slot purchased with SOL. New limit: {}", user_limit.team_limit);
        Ok(())
    }

    /// 使用USDC购买团队slot（对应EVM的buyteamamount_usdt）
    pub fn buy_team_slot_usdc(ctx: Context<BuyTeamSlotUsdc>) -> Result<()> {
        let slot_config = &ctx.accounts.slot_config;
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(slot_config.is_active, ErrorCode::SystemNotActive);
        require!(slot_config.slot_price_usdc > 0, ErrorCode::InvalidPrice);
        
        // USDC代币转账
        let transfer_accounts = Transfer {
            from: ctx.accounts.user_usdc_account.to_account_info(),
            to: ctx.accounts.treasury_usdc_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        
        anchor_spl::token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts),
            slot_config.slot_price_usdc,
        )?;
        
        // 更新用户限制
        user_limit.team_limit += 1;
        user_limit.total_spent_usdc += slot_config.slot_price_usdc;
        user_limit.slots_purchased += 1;
        
        // 更新全局统计
        let slot_config = &mut ctx.accounts.slot_config;
        slot_config.total_slots_sold += 1;
        
        emit!(TeamSlotPurchased {
            user: user_limit.user,
            payment_type: PaymentType::Usdc,
            amount_paid: slot_config.slot_price_usdc,
            new_team_limit: user_limit.team_limit,
            transaction_id: Clock::get()?.unix_timestamp,
        });
        
        msg!("Team slot purchased with USDC. New limit: {}", user_limit.team_limit);
        Ok(())
    }

    /// 批量购买团队slot（不含折扣，与EVM保持一致）
    pub fn buy_team_slots_batch(
        ctx: Context<BuyTeamSlotsBatch>,
        quantity: u8,
        use_usdc: bool,
    ) -> Result<()> {
        require!(quantity >= 1 && quantity <= 10, ErrorCode::InvalidQuantity);
        
        let slot_config = &ctx.accounts.slot_config;
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(slot_config.is_active, ErrorCode::SystemNotActive);
        
        let base_price = if use_usdc {
            slot_config.slot_price_usdc
        } else {
            slot_config.slot_price_sol
        };
        
        let total_cost = base_price * quantity as u64;
        
        if use_usdc {
            // USDC支付
            let transfer_accounts = Transfer {
                from: ctx.accounts.user_usdc_account.as_ref().unwrap().to_account_info(),
                to: ctx.accounts.treasury_usdc_account.as_ref().unwrap().to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            };
            
            anchor_spl::token::transfer(
                CpiContext::new(ctx.accounts.token_program.as_ref().unwrap().to_account_info(), transfer_accounts),
                total_cost,
            )?;
            
            user_limit.total_spent_usdc += total_cost;
        } else {
            // SOL支付
            let transfer_instruction = system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.treasury_sol.to_account_info(),
            };
            
            system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_instruction),
                total_cost,
            )?;
            
            user_limit.total_spent_sol += total_cost;
        }
        
        // 更新用户限制（1:1购买，无折扣）
        user_limit.team_limit += quantity;
        user_limit.slots_purchased += quantity as u64;
        
        // 更新全局统计
        let slot_config = &mut ctx.accounts.slot_config;
        slot_config.total_slots_sold += quantity as u64;
        
        emit!(TeamSlotsBatchPurchased {
            user: user_limit.user,
            payment_type: if use_usdc { PaymentType::Usdc } else { PaymentType::Sol },
            quantity_paid: quantity,
            quantity_received: quantity, // 1:1购买
            amount_paid: total_cost,
            new_team_limit: user_limit.team_limit,
        });
        
        msg!("Batch purchased {} slots. New limit: {}", quantity, user_limit.team_limit);
        Ok(())
    }

    /// 增加用户团队数量（团队创建时调用）
    pub fn increment_team_count(ctx: Context<IncrementTeamCount>) -> Result<()> {
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(user_limit.teams_created < user_limit.team_limit, ErrorCode::TeamLimitExceeded);
        
        user_limit.teams_created += 1;
        
        emit!(TeamCountIncremented {
            user: user_limit.user,
            teams_created: user_limit.teams_created,
            team_limit: user_limit.team_limit,
        });
        
        msg!("Team count incremented: {}/{}", user_limit.teams_created, user_limit.team_limit);
        Ok(())
    }

    /// 减少用户团队数量（团队删除时调用）
    pub fn decrement_team_count(ctx: Context<DecrementTeamCount>) -> Result<()> {
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(user_limit.teams_created > 0, ErrorCode::NoTeamsToDelete);
        
        user_limit.teams_created -= 1;
        
        emit!(TeamCountDecremented {
            user: user_limit.user,
            teams_created: user_limit.teams_created,
            team_limit: user_limit.team_limit,
        });
        
        msg!("Team count decremented: {}/{}", user_limit.teams_created, user_limit.team_limit);
        Ok(())
    }

    /// 管理员设置价格（对应EVM的setbuyamount和setbuyamount_usdt）
    pub fn set_slot_prices(
        ctx: Context<SetSlotPrices>,
        new_sol_price: Option<u64>,
        new_usdc_price: Option<u64>,
    ) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        
        if let Some(sol_price) = new_sol_price {
            slot_config.slot_price_sol = sol_price;
            msg!("SOL price updated to: {} lamports", sol_price);
        }
        
        if let Some(usdc_price) = new_usdc_price {
            slot_config.slot_price_usdc = usdc_price;
            msg!("USDC price updated to: {} tokens", usdc_price);
        }
        
        emit!(SlotPricesUpdated {
            sol_price: slot_config.slot_price_sol,
            usdc_price: slot_config.slot_price_usdc,
            updated_by: ctx.accounts.authority.key(),
        });
        
        Ok(())
    }

    /// 管理员切换系统状态
    pub fn toggle_system_status(ctx: Context<ToggleSystemStatus>) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        slot_config.is_active = !slot_config.is_active;
        
        emit!(SystemStatusToggled {
            is_active: slot_config.is_active,
            updated_by: ctx.accounts.authority.key(),
        });
        
        msg!("System status toggled to: {}", if slot_config.is_active { "active" } else { "inactive" });
        Ok(())
    }

    /// 查询用户团队限制信息
    pub fn get_user_limit(ctx: Context<GetUserLimit>) -> Result<UserLimitInfo> {
        let user_limit = &ctx.accounts.user_limit;
        
        Ok(UserLimitInfo {
            user: user_limit.user,
            team_limit: user_limit.team_limit,
            teams_created: user_limit.teams_created,
            slots_purchased: user_limit.slots_purchased,
            total_spent_sol: user_limit.total_spent_sol,
            total_spent_usdc: user_limit.total_spent_usdc,
            available_slots: user_limit.team_limit - user_limit.teams_created,
        })
    }
}

// ===== 数据结构定义 =====

/// 支付类型枚举
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum PaymentType {
    Sol,
    Usdc,
}

/// 用户限制信息返回结构
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UserLimitInfo {
    pub user: Pubkey,
    pub team_limit: u8,
    pub teams_created: u8,
    pub slots_purchased: u64,
    pub total_spent_sol: u64,
    pub total_spent_usdc: u64,
    pub available_slots: u8,
}

/// Slot购买系统配置
#[account]
pub struct SlotConfig {
    pub authority: Pubkey,       // 系统管理员
    pub treasury_sol: Pubkey,    // SOL收费钱包
    pub treasury_usdc: Pubkey,   // USDC收费钱包
    pub usdc_mint: Pubkey,       // USDC代币地址
    pub slot_price_sol: u64,     // SOL价格（lamports）
    pub slot_price_usdc: u64,    // USDC价格（最小单位）
    pub default_team_limit: u8,  // 默认团队限制
    pub total_slots_sold: u64,   // 总销售slot数量
    pub is_active: bool,         // 系统是否激活
    pub bump: u8,               // PDA bump
}

impl SlotConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 1 + 1;
}

/// 用户团队限制
#[account]
pub struct UserTeamLimit {
    pub user: Pubkey,            // 用户地址
    pub team_limit: u8,          // 团队限制数量
    pub teams_created: u8,       // 已创建团队数
    pub slots_purchased: u64,    // 购买的slot总数
    pub total_spent_sol: u64,    // 总花费SOL（lamports）
    pub total_spent_usdc: u64,   // 总花费USDC（最小单位）
    pub bump: u8,               // PDA bump
}

impl UserTeamLimit {
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 8 + 8 + 8 + 1;
}

// ===== 账户验证结构 =====

/// 初始化Slot系统
#[derive(Accounts)]
pub struct InitializeSlotSystem<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = SlotConfig::SPACE,
        seeds = [b"slot_config"],
        bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    /// CHECK: SOL treasury account
    pub treasury_sol: AccountInfo<'info>,
    
    #[account(
        constraint = treasury_usdc.mint == usdc_mint.key()
    )]
    pub treasury_usdc: Account<'info, TokenAccount>,
    
    /// USDC Mint账户
    /// 当前使用Devnet测试USDC: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
    pub usdc_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
}

/// 初始化用户限制
#[derive(Accounts)]
pub struct InitializeUserLimit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    #[account(
        init,
        payer = user,
        space = UserTeamLimit::SPACE,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
    
    pub system_program: Program<'info, System>,
}

/// SOL购买团队slot
#[derive(Accounts)]
pub struct BuyTeamSlotSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
    
    /// CHECK: SOL treasury account
    #[account(
        mut,
        constraint = treasury_sol.key() == slot_config.treasury_sol
    )]
    pub treasury_sol: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

/// USDC购买团队slot
#[derive(Accounts)]
pub struct BuyTeamSlotUsdc<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
    
    #[account(
        mut,
        constraint = user_usdc_account.mint == slot_config.usdc_mint,
        constraint = user_usdc_account.owner == user.key()
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = treasury_usdc_account.key() == slot_config.treasury_usdc
    )]
    pub treasury_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

/// 批量购买团队slots
#[derive(Accounts)]
pub struct BuyTeamSlotsBatch<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
    
    /// CHECK: SOL treasury account
    #[account(mut)]
    pub treasury_sol: AccountInfo<'info>,
    
    #[account(mut)]
    pub user_usdc_account: Option<Account<'info, TokenAccount>>,
    
    #[account(mut)]
    pub treasury_usdc_account: Option<Account<'info, TokenAccount>>,
    
    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>,
}

/// 增加团队计数
#[derive(Accounts)]
pub struct IncrementTeamCount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
}

/// 减少团队计数
#[derive(Accounts)]
pub struct DecrementTeamCount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
}

/// 设置slot价格
#[derive(Accounts)]
pub struct SetSlotPrices<'info> {
    #[account(
        mut,
        constraint = authority.key() == slot_config.authority
    )]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
}

/// 切换系统状态
#[derive(Accounts)]
pub struct ToggleSystemStatus<'info> {
    #[account(
        mut,
        constraint = authority.key() == slot_config.authority
    )]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
}

/// 获取用户限制
#[derive(Accounts)]
pub struct GetUserLimit<'info> {
    #[account(
        seeds = [b"user_team_limit", user_limit.user.as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
}

// ===== 事件定义 =====

#[event]
pub struct TeamSlotPurchased {
    pub user: Pubkey,
    pub payment_type: PaymentType,
    pub amount_paid: u64,
    pub new_team_limit: u8,
    pub transaction_id: i64,
}

#[event]
pub struct TeamSlotsBatchPurchased {
    pub user: Pubkey,
    pub payment_type: PaymentType,
    pub quantity_paid: u8,
    pub quantity_received: u8,
    pub amount_paid: u64,
    pub new_team_limit: u8,
}

#[event]
pub struct TeamCountIncremented {
    pub user: Pubkey,
    pub teams_created: u8,
    pub team_limit: u8,
}

#[event]
pub struct TeamCountDecremented {
    pub user: Pubkey,
    pub teams_created: u8,
    pub team_limit: u8,
}

#[event]
pub struct SlotPricesUpdated {
    pub sol_price: u64,
    pub usdc_price: u64,
    pub updated_by: Pubkey,
}

#[event]
pub struct SystemStatusToggled {
    pub is_active: bool,
    pub updated_by: Pubkey,
}

// ===== 错误代码定义 =====

#[error_code]
pub enum ErrorCode {
    #[msg("System is not active")]
    SystemNotActive,
    #[msg("Invalid price configuration")]
    InvalidPrice,
    #[msg("Invalid quantity (must be 1-10)")]
    InvalidQuantity,
    #[msg("Team limit exceeded")]
    TeamLimitExceeded,
    #[msg("No teams to delete")]
    NoTeamsToDelete,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Unauthorized access")]
    Unauthorized,
}