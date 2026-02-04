<?php

namespace Affino\Dialog\Laravel;

use Affino\Dialog\Laravel\View\Components\Dialog;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

class AffinoDialogServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'dialog-laravel');

        Blade::component('affino-dialog', Dialog::class);

        $this->publishes([
            __DIR__ . '/../resources/views' => resource_path('views/vendor/dialog-laravel'),
        ], 'affino-dialog-laravel-views');

        $this->publishes([
            __DIR__ . '/../resources/js' => resource_path('vendor/dialog-laravel/js'),
            __DIR__ . '/../dist' => resource_path('vendor/dialog-laravel/dist'),
        ], 'affino-dialog-laravel-assets');
    }
}
