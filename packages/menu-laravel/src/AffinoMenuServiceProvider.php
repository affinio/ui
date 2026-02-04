<?php

namespace Affino\Menu\Laravel;

use Illuminate\Support\ServiceProvider;

class AffinoMenuServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->publishes([
            __DIR__ . '/../resources/js' => resource_path('vendor/menu-laravel/js'),
            __DIR__ . '/../dist' => resource_path('vendor/menu-laravel/dist'),
        ], 'affino-menu-laravel-assets');
    }
}
